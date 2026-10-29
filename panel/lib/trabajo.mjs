// Trabajo para el panel: proyectos (los del equipo y los conocidos por la memoria), su git y su flujo. Solo lectura.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { estadoFlujo, leerJson } from '../../flujo/lib/estado.mjs';
import { proyectosConocidos } from '../../scripts/menu.mjs';

const NOMBRE_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();

export const carpetaProyectos = (trabajo) => path.join(trabajo, 'proyectos');
/** La bóveda también es un proyecto: se trabaja sobre la memoria (rama agente). */
export const BOVEDA = 'Bóveda';

/** Carpeta de un proyecto del equipo por su nombre; null si el nombre no es válido o no existe. */
export function rutaProyecto(trabajo, nombre, memoria = null) {
  if (nombre === BOVEDA) return memoria;
  if (typeof nombre !== 'string' || !NOMBRE_VALIDO.test(nombre)) return null;
  const ruta = path.join(carpetaProyectos(trabajo), nombre);
  try { return fs.statSync(ruta).isDirectory() ? ruta : null; } catch { return null; }
}

function datosGit(ruta) {
  try {
    const rama = git(['rev-parse', '--abbrev-ref', 'HEAD'], ruta);
    const sucios = git(['status', '--porcelain'], ruta).split('\n').filter(Boolean).length;
    const commits = git(['log', '-n8', '--format=%h%x1f%an%x1f%aI%x1f%s'], ruta).split('\n').filter(Boolean).map((l) => {
      const [hash, autor, fecha, asunto] = l.split('\x1f');
      return { hash, autor, fecha, asunto };
    });
    return { rama, sucios, commits };
  } catch {
    return null;
  }
}

/** Lista de proyectos: unión de las carpetas del equipo y de las notas Proyectos/*.md con `repo:`. */
export function listarProyectos(trabajo, memoria) {
  const locales = (() => {
    try {
      return fs.readdirSync(carpetaProyectos(trabajo), { withFileTypes: true })
        .filter((e) => e.isDirectory() && NOMBRE_VALIDO.test(e.name)).map((e) => e.name);
    } catch { return []; }
  })();
  const conocidos = memoria ? proyectosConocidos(memoria) : [];
  const notas = memoria ? (() => { try { return fs.readdirSync(path.join(memoria, 'Proyectos')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)); } catch { return []; } })() : [];
  // Primero el propio agente y la bóveda; después el resto por orden alfabético.
  const orden = (n) => (n.toLowerCase() === 'nullraptor' ? 0 : n === BOVEDA ? 1 : 2);
  const nombres = [...new Set([...locales, ...conocidos.map((c) => c.nombre), ...(memoria ? [BOVEDA] : [])])]
    .sort((a, b) => orden(a) - orden(b) || a.localeCompare(b, 'es'));
  return nombres.map((nombre) => {
    const ruta = nombre === BOVEDA ? memoria : locales.includes(nombre) ? path.join(carpetaProyectos(trabajo), nombre) : null;
    let flujo = null;
    if (ruta) {
      const f = estadoFlujo(ruta);
      flujo = {
        tareas: f.tareas.length,
        integradas: f.tareas.filter((t) => t.estado === 'integrado').length,
        enCurso: f.tareas.find((t) => t.estado === 'en curso')?.id ?? null,
        bloqueo: f.bloqueo,
      };
    }
    const g = ruta ? datosGit(ruta) : null;
    return {
      nombre,
      local: Boolean(ruta),
      repo: conocidos.find((c) => c.nombre === nombre)?.repo ?? null,
      nota: notas.includes(nombre) ? `Proyectos/${nombre}.md` : null,
      rama: g?.rama ?? null,
      sucios: g?.sucios ?? 0,
      ultimo: g?.commits[0] ?? null,
      flujo,
    };
  });
}

/** Detalle de un proyecto del equipo: git, flujo completo y registro en vivo. */
export function detalleProyecto(trabajo, nombre, memoria = null) {
  const ruta = rutaProyecto(trabajo, nombre, memoria);
  if (!ruta) return null;
  return { nombre, git: datosGit(ruta), flujo: estadoFlujo(ruta) };
}

/** Recomendaciones MCP del día y servidores instalados (MCP/estado.json de la bóveda). */
export function estadoMcp(memoria) {
  if (!memoria) return null;
  const e = leerJson(path.join(memoria, 'MCP', 'estado.json'), null);
  if (!e) return null;
  return {
    ultimaExploracion: e.ultimaExploracion ?? null,
    hoy: (e.hoy ?? []).map((s) => ({ id: s.id, titulo: s.titulo, descripcion: s.descripcion, categoria: s.categoria ?? null, porque: s.porque ?? null, repo: s.repo ?? null })),
    instalados: (e.instalados ?? []).map((s) => (typeof s === 'string' ? s : s.id)),
  };
}
