// Centro de herramientas: las que trae la imagen (Ruflo) y las propias, que viven en el volumen y se añaden en
// caliente, sin reconstruir la imagen. Cada propia es una carpeta $TRABAJO_DIR/herramientas/<id> con su ficha:
//
//   herramienta.json
//   {
//     "nombre": "Tiempo",
//     "descripcion": "Previsión del tiempo para la IA.",
//     "tipo": "mcp",
//     "mcp": {
//       "script": "servidor.mjs",                       // dentro de la carpeta; se arranca con node
//       "args": ["--modo", "rapido"],                   // opcional
//       "variables": [{ "nombre": "TIEMPO_CLAVE", "obligatoria": true, "secreta": true }]   // opcional, del cofre
//     }
//   }
//
// Una herramienta corre con los permisos del contenedor: solo se activa cuando Daniel la aprueba en el panel.
import fs from 'node:fs';
import path from 'node:path';
import { RESERVADAS } from './mcp.mjs';

export const FICHA = 'herramienta.json';
export const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,49}$/;
const VARIABLE = /^[A-Z_][A-Z0-9_]*$/;
const SCRIPT = /\.(mjs|cjs|js)$/;
const texto = (s, max) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Las que vienen en la imagen: siempre activas y fuera del volumen. Su configuración la pone scripts/ia.mjs. */
export const DE_LA_IMAGEN = [
  { id: 'ruflo', nombre: 'Ruflo', descripcion: 'Memoria entre sesiones, tareas, coordinación de agentes y análisis de cambios.', tipo: 'mcp', origen: 'imagen' },
];

export const carpetaHerramientas = (trabajo, env = process.env) => path.resolve(env.HERRAMIENTAS_DIR ?? path.join(trabajo, 'herramientas'));

const dentro = (base, ruta) => ruta === base || ruta.startsWith(base + path.sep);

/** Lee y valida la ficha de una herramienta propia. Lanza un error con el motivo si no es válida. */
export function leerFicha(base, id) {
  if (!ID_VALIDO.test(id)) throw new Error('el nombre de la carpeta debe ir en minúsculas, números y guiones');
  const raiz = fs.realpathSync(base);
  const carpeta = fs.realpathSync(path.join(raiz, id));
  if (!dentro(raiz, carpeta) || carpeta === raiz) throw new Error('la carpeta apunta fuera de las herramientas');
  let f;
  try { f = JSON.parse(fs.readFileSync(path.join(carpeta, FICHA), 'utf8')); } catch (e) { throw new Error(`${FICHA} ausente o mal escrito (${e.code ?? e.message})`); }
  const nombre = texto(f.nombre, 60);
  if (!nombre) throw new Error('falta «nombre»');
  if (f.tipo !== 'mcp') throw new Error('«tipo» debe ser "mcp" (de momento, el único)');
  const m = f.mcp ?? {};
  if (typeof m.script !== 'string' || !SCRIPT.test(m.script) || path.isAbsolute(m.script)) throw new Error('«mcp.script» debe ser un .mjs, .cjs o .js relativo a la carpeta');
  let script;
  try { script = fs.realpathSync(path.join(carpeta, m.script)); } catch { throw new Error(`no existe ${m.script}`); }
  if (!dentro(carpeta, script)) throw new Error('«mcp.script» sale de la carpeta de la herramienta');
  const args = m.args ?? [];
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string' || a.length > 200) || args.length > 20) throw new Error('«mcp.args» debe ser una lista corta de textos');
  const variables = m.variables ?? [];
  if (!Array.isArray(variables)) throw new Error('«mcp.variables» debe ser una lista');
  const vars = variables.map((v) => {
    if (!VARIABLE.test(v?.nombre ?? '')) throw new Error(`variable no válida: ${JSON.stringify(v?.nombre)}`);
    // Las credenciales del agente nunca llegan a una herramienta.
    if (RESERVADAS.test(v.nombre)) throw new Error(`${v.nombre} es una credencial del agente: no se entrega a herramientas`);
    return { nombre: v.nombre, obligatoria: Boolean(v.obligatoria), secreta: Boolean(v.secreta) };
  });
  return {
    id, nombre, descripcion: texto(f.descripcion, 300), tipo: 'mcp', origen: 'propia', carpeta,
    mcp: { script, args, variables: vars },
  };
}

/** Todas las herramientas: primero las de la imagen; las propias con `error` si su ficha no vale. */
export function listarHerramientas({ trabajo, env = process.env }) {
  const base = carpetaHerramientas(trabajo, env);
  let ids = [];
  try { ids = fs.readdirSync(base, { withFileTypes: true }).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { /* sin carpeta: ninguna propia */ }
  const propias = ids.map((id) => {
    try { return leerFicha(base, id); } catch (e) { return { id, nombre: id, descripcion: '', tipo: null, origen: 'propia', error: e.message }; }
  });
  return [...DE_LA_IMAGEN, ...propias];
}
