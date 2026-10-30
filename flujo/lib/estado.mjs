// Lectura del estado del flujo de un proyecto (solo lectura): tareas, ejecuciones y fases.
// La usan el monitor de terminal y el panel web.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const FASES = ['implementador', 'typecheck', 'pruebas', 'build', 'e2e', 'revision'];
export const NOMBRE_FASE = {
  implementador: 'Implementación', typecheck: 'Typecheck', pruebas: 'Unitarias', build: 'Build', e2e: 'E2E', revision: 'Revisión',
};

/**
 * Dónde guarda el flujo lo de un proyecto, siempre fuera de su repositorio: los contratos de tareas en la bóveda
 * (Proyectos/<nombre>/Tareas) y los registros y worktrees en el volumen de Nullraptor ($TRABAJO_DIR/flujo/<nombre>).
 */
export function rutasFlujo(raiz, { nombre = path.basename(path.resolve(raiz)), trabajo = process.env.TRABAJO_DIR, boveda = process.env.BOVEDA_DIR } = {}) {
  const base = path.join(path.resolve(trabajo ?? path.join(raiz, '..', '..')), 'flujo', nombre);
  return {
    tareas: boveda ? path.join(path.resolve(boveda), 'Proyectos', nombre, 'Tareas') : null,
    runs: path.join(base, 'runs'),
    worktrees: path.join(base, 'worktrees'),
  };
}

export const leerJson = (ruta, defecto) => {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return defecto;
  }
};

export function procesoVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function leerTareas(raiz, rutas = rutasFlujo(raiz)) {
  const dir = rutas.tareas;
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((n) => {
      const t = fs.readFileSync(path.join(dir, n), 'utf8');
      const campo = (c) => t.match(new RegExp(`^${c}:\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? '';
      return {
        id: campo('Id') || n.replace(/\.md$/, ''),
        titulo: t.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? n,
        dependencias: campo('Depende de').split(',').map((s) => s.trim()).filter((s) => s && !/^ningun/i.test(s)),
      };
    });
}

/** Estado de las fases de un intento a partir de los registros y del resumen. */
export function fasesDeIntento(archivos, n, intento = {}) {
  const hechas = new Set(FASES.filter((f) => archivos.includes(`intento-${n}-${f}.log`)));
  const comprob = intento.comprobaciones ?? {};
  return FASES.map((f) => {
    let estado = 'pendiente';
    if (hechas.has(f)) estado = comprob[f] === false || (f === 'revision' && intento.revision?.approved === false) ? 'fallo' : 'ok';
    return { fase: f, estado };
  });
}

function ultimaLinea(archivo) {
  try {
    const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/).map((l) => l.trim())
      .filter((l) => l && !/^(---|\$ )/.test(l));
    return lineas.at(-1) ?? '';
  } catch {
    return '';
  }
}

export function datosEjecucion(raiz, id, rutas = rutasFlujo(raiz)) {
  const dir = path.join(rutas.runs, id ?? '');
  if (!id || !fs.existsSync(dir)) return null;
  const resumen = leerJson(path.join(dir, 'resumen.json'), null);
  const archivos = fs.readdirSync(dir);
  let n = Math.max(1, resumen?.intentos?.length ?? 1);
  let intento = resumen?.intentos?.[n - 1] ?? {};
  // El resumen se guarda al cerrar cada intento: si el último falló y la
  // ejecución sigue abierta, el intento actual es el siguiente.
  if (intento.fallo && !resumen?.fin && n < (resumen?.maxIntentos ?? 3)) {
    n += 1;
    intento = {};
  }
  const fases = fasesDeIntento(archivos, n, intento);
  const actual = fases.find((f) => f.estado === 'pendiente')?.fase ?? null;
  const registros = archivos.filter((a) => a.startsWith(`intento-${n}-`) && a.endsWith('.log'))
    .map((a) => ({ a, t: fs.statSync(path.join(dir, a)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  // Referencia de tiempo: último registro del intento, su inicio o el último guardado del resumen.
  let desde = registros[0]?.t ?? (intento.inicio ? Date.parse(intento.inicio) : null);
  if (desde == null) {
    try { desde = fs.statSync(path.join(dir, 'resumen.json')).mtimeMs; } catch { desde = Date.now(); }
  }
  // Si el coordinador escribe registro en vivo, se muestra su última línea.
  const vivo = path.join(dir, 'en-curso.log');
  const fuente = fs.existsSync(vivo) ? vivo : registros[0] ? path.join(dir, registros[0].a) : null;
  return { id, resumen, n, fases, actual, desde, enVivo: fuente === vivo, ultimo: fuente ? ultimaLinea(fuente) : '' };
}

export function ramasPendientes(raiz) {
  try {
    return execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/flujo/'], { cwd: raiz, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

/** Todo el estado del flujo de un proyecto, en datos (para el panel). */
export function estadoFlujo(raiz, rutas = rutasFlujo(raiz)) {
  const { runs } = rutas;
  const estado = leerJson(path.join(runs, 'estado-tareas.json'), {});
  const bloqueo = leerJson(path.join(runs, 'flujo.lock'), null);
  const tareas = leerTareas(raiz, rutas).map((t) => {
    const e = estado[t.id];
    const ej = e?.ejecucion ? datosEjecucion(raiz, e.ejecucion, rutas) : null;
    return {
      ...t,
      estado: e?.estado ?? 'pendiente',
      ejecucion: ej && {
        id: ej.id, intento: ej.n, maxIntentos: ej.resumen?.maxIntentos ?? 3, fases: ej.fases, actual: ej.actual,
        desde: ej.desde, enVivo: ej.enVivo, ultimo: ej.ultimo,
        inicio: ej.resumen?.inicio ?? null, fin: ej.resumen?.fin ?? null, intentos: ej.resumen?.intentos?.length ?? 0,
      },
    };
  });
  return {
    tareas,
    bloqueo: bloqueo && { id: bloqueo.id, inicio: bloqueo.inicio ?? null, vivo: procesoVivo(bloqueo.pid) },
    ramasPendientes: ramasPendientes(raiz),
  };
}
