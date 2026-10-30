// Lectura de tareas (Markdown, en la bóveda: Proyectos/<proyecto>/Tareas), orden por dependencias y estado persistente.
import fs from 'node:fs';
import path from 'node:path';
import { RUNS, TAREAS } from './comun.mjs';

const ESTADO = path.join(RUNS, 'estado-tareas.json');

function carpetaTareas() {
  if (!TAREAS) throw new Error('Sin bóveda (BOVEDA_DIR): las tareas del flujo viven en Proyectos/<proyecto>/Tareas de la bóveda.');
  return TAREAS;
}

// Rutas que una tarea nunca puede dar al implementador: pruebas, criterios,
// coordinador, manifiestos, configuración de herramientas y secretos.
export const PROHIBIDOS = [
  /^tests\//, /^tareas\//, /^scripts\//, /^config\//, /^docs\//, /^package(-lock)?\.json$/, /^\.env/,
  /^(tsconfig\.json|next\.config\.ts|playwright\.config\.ts|postcss\.config\.mjs)$/,
  /^\.(claude|codex|agents|claude-flow|git|tools|worktrees|runs|swarm)\//, /^node_modules\//, /^evidencia\//,
  /^(AGENTS|CLAUDE)\.md$/,
];

const lista = (texto) => texto.split(',').map((s) => s.trim().replaceAll('\\', '/')).filter((s) => s && !/^ningun[ao]s?$/i.test(s));
const campo = (texto, nombre) => texto.match(new RegExp(`^${nombre}:\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? '';

/** Lee una tarea por su archivo (p. ej. «F1-01-catalogo.md»), dentro de la carpeta de tareas de la bóveda. */
export function leerTarea(ruta) {
  const dir = carpetaTareas();
  const abs = path.resolve(dir, ruta);
  if (!abs.startsWith(dir + path.sep)) throw new Error(`La tarea debe estar en ${dir}: ${ruta}`);
  const texto = fs.readFileSync(abs, 'utf8');
  const titulo = texto.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const relativa = path.relative(dir, abs).replaceAll('\\', '/');
  const tarea = {
    ruta: relativa,
    id: campo(texto, 'Id') || path.basename(abs, '.md'),
    titulo,
    texto,
    permitidos: lista(campo(texto, 'Archivos permitidos')),
    dependencias: lista(campo(texto, 'Depende de')),
    pruebas: lista(campo(texto, 'Pruebas de aceptación')),
  };
  if (!titulo) throw new Error(`${relativa}: falta el título «# …»`);
  if (tarea.permitidos.length === 0) throw new Error(`${relativa}: falta «Archivos permitidos: …»`);
  for (const p of tarea.permitidos) {
    if (path.isAbsolute(p) || p.split('/').includes('..') || PROHIBIDOS.some((r) => r.test(p))) {
      throw new Error(`${relativa}: archivo no permitido para el implementador: ${p}`);
    }
  }
  for (const p of tarea.pruebas) {
    if (!/^tests\//.test(p)) throw new Error(`${relativa}: las pruebas de aceptación deben estar en tests/: ${p}`);
  }
  return tarea;
}

/** Tareas de la carpeta de tareas (sin subcarpetas ni archivos que empiecen por «_»). */
export function listarTareas() {
  const dir = carpetaTareas();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((n) => leerTarea(n));
}

/** Orden topológico estable; falla ante dependencias desconocidas o ciclos. */
export function ordenar(tareas) {
  const porId = new Map(tareas.map((t) => [t.id, t]));
  if (porId.size !== tareas.length) throw new Error('Hay tareas con el mismo Id');
  for (const t of tareas) {
    for (const d of t.dependencias) if (!porId.has(d)) throw new Error(`${t.id} depende de «${d}», que no existe`);
  }
  const resultado = [];
  const estado = new Map();
  const visitar = (t, camino) => {
    if (estado.get(t.id) === 'hecho') return;
    if (estado.get(t.id) === 'visitando') throw new Error(`Dependencia circular: ${[...camino, t.id].join(' → ')}`);
    estado.set(t.id, 'visitando');
    for (const d of t.dependencias) visitar(porId.get(d), [...camino, t.id]);
    estado.set(t.id, 'hecho');
    resultado.push(t);
  };
  for (const t of tareas) visitar(t, []);
  return resultado;
}

export function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
  } catch {
    return {};
  }
}

export function guardarEstado(id, datos) {
  const estado = leerEstado();
  estado[id] = { ...datos, actualizado: new Date().toISOString() };
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(ESTADO, `${JSON.stringify(estado, null, 2)}\n`);
}
