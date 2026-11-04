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
