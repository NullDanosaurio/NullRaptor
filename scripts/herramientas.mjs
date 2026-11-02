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
// Una herramienta corre con los permisos del contenedor: solo se activa cuando Daniel la aprueba en el panel. Al
// aprobarla se guarda la huella (sha256) de todo su contenido en ~/.nullraptor/herramientas.json, fuera de la carpeta
// de herramientas y vedado a las sesiones de Claude del panel; si después cambia un archivo, deja de estar activa
// («cambiada») hasta que se apruebe de nuevo.
// Estados: activa (de la imagen) · propuesta · aprobada · cambiada · no válida.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
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

const MAX_ARCHIVOS = 5000;
const MAX_BYTES = 200 * 1024 * 1024;

/** Huella de una carpeta: rutas relativas, tipo y contenido de cada archivo (los enlaces, por su destino, sin seguirlos). */
export function huella(carpeta) {
  const h = createHash('sha256');
  let archivos = 0;
  let bytes = 0;
  const recorrer = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (++archivos > MAX_ARCHIVOS) throw new Error(`más de ${MAX_ARCHIVOS} archivos: demasiado grande para aprobarla`);
      if (e.isSymbolicLink()) h.update(`l\0${r}\0${fs.readlinkSync(abs)}\0`);
      else if (e.isDirectory()) { h.update(`d\0${r}\0`); recorrer(abs, r); } else if (e.isFile()) {
        const datos = fs.readFileSync(abs);
        bytes += datos.length;
        if (bytes > MAX_BYTES) throw new Error('más de 200 MB: demasiado grande para aprobarla');
        h.update(`f\0${r}\0${datos.length}\0`).update(datos);
      }
    }
  };
  recorrer(carpeta, '');
  return h.digest('hex');
}

export const archivoAprobaciones = (env = process.env) => path.join(env.HOME ?? os.homedir(), '.nullraptor', 'herramientas.json');

export function leerAprobaciones(env = process.env) {
  try {
    const a = JSON.parse(fs.readFileSync(archivoAprobaciones(env), 'utf8'));
    return a && typeof a === 'object' && !Array.isArray(a) ? a : {};
  } catch { return {}; }
}

function guardarAprobaciones(env, aprobaciones) {
  const archivo = archivoAprobaciones(env);
  fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
  const temporal = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, `${JSON.stringify(aprobaciones, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporal, archivo);
}

const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });

/** Aprueba una herramienta propia válida con la huella de lo que hay ahora. Con `esperada` (la huella que Daniel
 * revisó en el panel), si el contenido ha cambiado entretanto no se aprueba (409). */
export function aprobar({ trabajo, env = process.env, id, quien = 'este equipo', esperada = null }) {
  if (DE_LA_IMAGEN.some((h) => h.id === id)) throw fallo('Las herramientas de la imagen siempre están activas.', 400);
  let h;
  try { h = leerFicha(carpetaHerramientas(trabajo, env), id); } catch (e) { throw fallo(e.code === 'ENOENT' ? 'Esa herramienta no existe.' : `No se puede aprobar: ${e.message}.`, e.code === 'ENOENT' ? 404 : 400); }
  let firma;
  try { firma = huella(h.carpeta); } catch (e) { throw fallo(`No se puede aprobar: ${e.message}.`, 400); }
  if (esperada !== null && esperada !== firma) throw fallo('La herramienta ha cambiado mientras la revisabas: vuelve a mirarla.', 409);
  const aprobaciones = leerAprobaciones(env);
  aprobaciones[id] = { huella: firma, fecha: new Date().toISOString(), quien };
  guardarAprobaciones(env, aprobaciones);
  return { id, huella: firma };
}

/** Retira la aprobación: la herramienta vuelve a «propuesta». False si no estaba aprobada. */
export function desactivar({ env = process.env, id }) {
  const aprobaciones = leerAprobaciones(env);
  if (!Object.hasOwn(aprobaciones, id)) return false;
  delete aprobaciones[id];
  guardarAprobaciones(env, aprobaciones);
  return true;
}

function estadoDe(h, aprobaciones) {
  if (h.origen === 'imagen') return { estado: 'activa' };
  if (h.error) return { estado: 'no válida' };
  const a = Object.hasOwn(aprobaciones, h.id) ? aprobaciones[h.id] : null;
  let actual;
  try { actual = huella(h.carpeta); } catch (e) { return { estado: a ? 'cambiada' : 'propuesta', ...(a && { aprobada: a.fecha }), motivo: e.message }; }
  if (!a) return { estado: 'propuesta', huella: actual };
  return { estado: actual === a.huella ? 'aprobada' : 'cambiada', aprobada: a.fecha, huella: actual };
}

/** Todas las herramientas: primero las de la imagen; las propias con `error` si su ficha no vale. */
export function listarHerramientas({ trabajo, env = process.env }) {
  const base = carpetaHerramientas(trabajo, env);
  let ids = [];
  try { ids = fs.readdirSync(base, { withFileTypes: true }).filter((e) => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.')).map((e) => e.name).sort(); } catch { /* sin carpeta: ninguna propia */ }
  const propias = ids.map((id) => {
    try { return leerFicha(base, id); } catch (e) { return { id, nombre: id, descripcion: '', tipo: null, origen: 'propia', error: e.message }; }
  });
  const aprobaciones = leerAprobaciones(env);
  return [...DE_LA_IMAGEN, ...propias].map((h) => ({ ...h, ...estadoDe(h, aprobaciones) }));
}

/** Las propias que pueden correr ahora: aprobadas y sin cambios desde entonces. */
export const herramientasActivas = ({ trabajo, env = process.env }) => listarHerramientas({ trabajo, env }).filter((h) => h.estado === 'aprobada');

const MAX_LISTA = 300;
const MAX_VER = 200 * 1024;

/** Archivos de una herramienta propia, para revisarla antes de aprobarla (hasta 300; los enlaces, con su destino). */
export function archivosDe({ trabajo, env = process.env, id }) {
  const h = leerFicha(carpetaHerramientas(trabajo, env), id);
  const archivos = [];
  const recorrer = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (archivos.length >= MAX_LISTA) return;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(dir, e.name);
      if (e.isSymbolicLink()) archivos.push({ ruta: r, enlace: fs.readlinkSync(abs) });
      else if (e.isDirectory()) recorrer(abs, r);
      else if (e.isFile()) archivos.push({ ruta: r, bytes: fs.statSync(abs).size });
    }
  };
  recorrer(h.carpeta, '');
  return { archivos, cortada: archivos.length >= MAX_LISTA };
}

/** Texto de un archivo de una herramienta (sin seguir enlaces ni salir de su carpeta), hasta 200 KB. */
export function verArchivo({ trabajo, env = process.env, id, ruta }) {
  const h = leerFicha(carpetaHerramientas(trabajo, env), id);
  if (typeof ruta !== 'string' || !ruta || path.isAbsolute(ruta) || ruta.split(/[\\/]/).includes('..')) throw fallo('Ruta no válida.', 400);
  const abs = path.join(h.carpeta, ruta);
  let st;
  try { st = fs.lstatSync(abs); } catch { throw fallo('Ese archivo no existe.', 404); }
  if (!st.isFile() || fs.realpathSync(abs) !== abs) throw fallo('Solo se ven archivos normales (no enlaces ni carpetas).', 400);
  const datos = fs.readFileSync(abs);
  const binario = datos.subarray(0, 8000).includes(0);
  return { ruta, bytes: datos.length, binario, texto: binario ? null : datos.subarray(0, MAX_VER).toString('utf8'), cortado: datos.length > MAX_VER };
}

/** La herramienta, solo si ahora mismo está aprobada y sin cambios. El lanzador lo comprueba en cada arranque. */
export function herramientaLanzable({ trabajo, env = process.env, id }) {
  const h = listarHerramientas({ trabajo, env }).find((x) => x.id === id && x.origen === 'propia');
  if (!h) throw new Error(`no existe la herramienta «${id}»`);
  if (h.estado !== 'aprobada') throw new Error(`«${id}» está ${h.estado}: apruébala en el panel (Herramientas)`);
  return h;
}

/** Entradas MCP de las propias aprobadas. Arrancan con el lanzador (scripts/herramienta-mcp.mjs), que vuelve a
 * comprobar la huella cada vez. Las variables salen del cofre (env); si falta una obligatoria, se omite y se avisa. */
export function configHerramientas({ agente, trabajo, env = process.env }) {
  const servidores = {};
  for (const h of herramientasActivas({ trabajo, env })) {
    const faltan = h.mcp.variables.filter((v) => v.obligatoria && !env[v.nombre]).map((v) => v.nombre);
    if (faltan.length) { console.warn(`Herramienta ${h.id} sin activar: faltan ${faltan.join(', ')} en el cofre.`); continue; }
    const variables = Object.fromEntries(h.mcp.variables.filter((v) => env[v.nombre]).map((v) => [v.nombre, env[v.nombre]]));
    const base = { TRABAJO_DIR: path.resolve(trabajo), HOME: env.HOME ?? os.homedir(), ...(env.HERRAMIENTAS_DIR && { HERRAMIENTAS_DIR: env.HERRAMIENTAS_DIR }) };
    servidores[`herramienta-${h.id}`] = { command: process.execPath, args: [path.join(agente, 'scripts', 'herramienta-mcp.mjs'), h.id], env: { ...base, ...variables } };
  }
  return servidores;
}
