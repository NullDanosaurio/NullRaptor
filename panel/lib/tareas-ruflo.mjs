// Tareas de Ruflo para el Resumen del panel (solo lectura). La IA las crea con mcp__ruflo__task_create; Ruflo las
// guarda en el volumen, en <CLAUDE_FLOW_MEMORY_PATH>/../tasks/store.json ({ tasks: { id: tarea } }). El proyecto sale
// de la etiqueta o del «[Proyecto]» con que empieza la descripción (reglas globales).
import fs from 'node:fs';
import path from 'node:path';

const ESTADOS = { in_progress: 'en curso', pending: 'pendiente', completed: 'hecha', failed: 'fallida', cancelled: 'cancelada' };

export const archivoTareasRuflo = (env = process.env) => env.RUFLO_TAREAS
  ?? path.join(path.dirname(env.CLAUDE_FLOW_MEMORY_PATH ?? '/estado/ruflo/swarm'), 'tasks', 'store.json');

/** Tareas normalizadas: { id, proyecto, texto, estado, creada, cerrada }. Sin archivo (o roto), []. */
export function leerTareasRuflo(archivo) {
  let datos;
  try { datos = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return []; }
  const lista = datos?.tasks && typeof datos.tasks === 'object' ? Object.values(datos.tasks) : [];
  return lista.filter((t) => t && typeof t.description === 'string').map((t) => {
    const marca = t.description.match(/^\[([^\]]{1,80})\]\s*/);
    return {
      id: String(t.taskId ?? ''),
      proyecto: marca?.[1] ?? (Array.isArray(t.tags) && typeof t.tags[0] === 'string' ? t.tags[0] : null),
      texto: t.description.slice(marca?.[0].length ?? 0).slice(0, 300),
      estado: ESTADOS[t.status] ?? String(t.status ?? ''),
      creada: t.createdAt ?? null,
      cerrada: t.completedAt ?? null,
    };
  });
}

/** Para el Resumen: las abiertas (en curso primero, luego pendientes, las más recientes antes), las cerradas hoy y
 * la cuenta por proyecto. */
export function resumenTareas(tareas, { max = 12, hoy = new Date() } = {}) {
  const dia = hoy.toISOString().slice(0, 10);
  const orden = (t) => (t.estado === 'en curso' ? 0 : 1);
  const abiertas = tareas.filter((t) => t.estado === 'en curso' || t.estado === 'pendiente')
    .sort((a, b) => orden(a) - orden(b) || String(b.creada).localeCompare(String(a.creada)));
  const hechasHoy = tareas.filter((t) => t.estado === 'hecha' && String(t.cerrada).startsWith(dia));
  const porProyecto = {};
  for (const t of abiertas) {
    const p = (porProyecto[t.proyecto ?? 'Sin proyecto'] ??= { enCurso: 0, pendientes: 0 });
    if (t.estado === 'en curso') p.enCurso += 1; else p.pendientes += 1;
  }
  return { abiertas: abiertas.slice(0, max), totalAbiertas: abiertas.length, hechasHoy: hechasHoy.length, porProyecto };
}

/** Avance por proyecto con TODAS sus tareas (hechas de cualquier día; sin canceladas ni fallidas). */
export function avanceTareas(tareas) {
  const avance = {};
  for (const t of tareas) {
    const clave = { hecha: 'hechas', 'en curso': 'enCurso', pendiente: 'pendientes' }[t.estado];
    if (!clave) continue;
    const a = (avance[t.proyecto ?? 'Sin proyecto'] ??= { hechas: 0, enCurso: 0, pendientes: 0, total: 0 });
    a[clave] += 1; a.total += 1;
  }
  return avance;
}

/** «parada» si la sesión lleva demasiado sin eventos; si no, «trabajando» con una tarea en curso, y «esperando». */
export const estadoProyecto = (av, sesion) => (sesion?.parada ? 'parada' : av.enCurso > 0 && !sesion?.terminada ? 'trabajando' : 'esperando');

/** Resumen con `avance` por proyecto, su estado y los segundos desde el último latido (null sin sesión). Un proyecto
 * con sesión parada y sin tareas también aparece. */
export function conSesiones(resumen, sesiones = {}, tareas = []) {
  const base = avanceTareas(tareas);
  for (const [p, s] of Object.entries(sesiones)) if (s.parada && !base[p]) base[p] = { hechas: 0, enCurso: 0, pendientes: 0, total: 0 };
  const avance = {};
  for (const [p, a] of Object.entries(base)) {
    const s = Object.hasOwn(sesiones, p) ? sesiones[p] : null;
    avance[p] = { ...a, estado: estadoProyecto(a, s), hace: s ? Math.round(s.hace) : null };
  }
  return { ...resumen, avance };
}
