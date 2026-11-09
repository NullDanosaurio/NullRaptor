// Historial de desarrollo de Codex: metadatos nativos, sin leer conversaciones ni incluir chats de consulta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardarPrivado } from './codex-config.mjs';
import { argsSandboxCodex } from './codex-sandbox.mjs';

export const idCodexValido = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const casaCodex = (env) => env.CODEX_HOME ?? path.join(env.HOME ?? os.homedir(), '.codex');

const MAX_PRIMERA_LINEA = 4 * 1024 * 1024;

/** Primera línea del archivo, leída por bloques de 64 KB hasta el primer salto de línea (con tope). */
function primeraLinea(fd) {
  const b = Buffer.alloc(64 * 1024);
  const trozos = [];
  let total = 0;
  for (let pos = 0; total < MAX_PRIMERA_LINEA; pos += b.length) {
    const n = fs.readSync(fd, b, 0, b.length, pos);
    if (!n) break;
    const fin = b.subarray(0, n).indexOf(10);
    trozos.push(Buffer.from(b.subarray(0, fin >= 0 ? fin : n)));
    total += n;
    if (fin >= 0) break;
  }
  return Buffer.concat(trozos).toString('utf8');
}

// Caché por ruta + mtime + tamaño: GET /api/remoto no reabre cada .jsonl en cada consulta.
let cacheMeta = new Map();

function leerMeta(archivo) {
  const st = fs.statSync(archivo);
  const previo = cacheMeta.get(archivo);
  if (previo && previo.mtimeMs === st.mtimeMs && previo.size === st.size) return previo;
  let meta = null;
  let fd;
  try {
    fd = fs.openSync(archivo, 'r');
    const dato = JSON.parse(primeraLinea(fd));
    const m = dato.payload;
    if (dato.type === 'session_meta' && idCodexValido(m?.id)) meta = { id: m.id, cwd: m.cwd, inicio: m.timestamp ?? dato.timestamp, source: m.source };
  } catch { /* Un archivo incompleto no impide listar los demás. */ }
  finally { if (fd !== undefined) fs.closeSync(fd); }
  return { mtimeMs: st.mtimeMs, size: st.size, meta };
}

export function sesionesCodex(env = process.env) {
  const sesiones = [];
  const vistos = new Map();
  const visitar = (dir, nivel = 0) => {
    if (nivel > 4) return;
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const archivo = path.join(dir, e.name);
      if (e.isDirectory()) visitar(archivo, nivel + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        try {
          const entrada = leerMeta(archivo);
          vistos.set(archivo, entrada);
          if (entrada.meta) sesiones.push({ ...entrada.meta });
        } catch { /* Desaparecido entre medias. */ }
      }
    }
  };
  visitar(path.join(casaCodex(env), 'sessions'));
  cacheMeta = vistos; // olvida los archivos que ya no están
  return sesiones.sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
}

export function argsDesarrolloCodex({ ruta, adjuntos, memoria = null, sesion = null, continuar = false, instrucciones = '', configuracion = [], aviso = null, env = process.env, trabajo = null, configDir = env.CLAUDE_CONFIG_DIR }) {
  // Sandbox por permisos de ruta (codex-sandbox.mjs): proyecto y .git escribibles, secretos ocultos.
  const args = ['--no-daemon', ...argsSandboxCodex({ ruta, escribibles: [adjuntos].filter(Boolean), memoria, env, configDir, trabajo }),
    '--ask-for-approval', 'on-request', '-C', ruta, ...configuracion];
  if (instrucciones) args.push('-c', `developer_instructions=${JSON.stringify(instrucciones)}`);
  if (sesion) args.push('resume', sesion);
  else if (continuar) args.push('resume', '--last');
  if (typeof aviso === 'string' && aviso.trim()) args.push('--', aviso.trim());
  return args;
}

// Índice de los relevos: sobrevive aunque otro relevo sustituya el estado del mismo proyecto.
export function registrarRelevoCodex(trabajo, datos) {
  if (!idCodexValido(datos.id)) return;
  const dir = path.join(trabajo, '.sesiones-codex');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); } catch { /* Carpeta ajena: se deja. */ }
  guardarPrivado(path.join(dir, `${datos.id}.json`), JSON.stringify(datos));
}

export function relevosCodex(trabajo) {
  const dir = path.join(trabajo, '.sesiones-codex');
  try {
    return fs.readdirSync(dir).filter((n) => /^[0-9a-f-]{36}\.json$/i.test(n)).flatMap((n) => {
      try { return [JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'))]; } catch { return []; }
    });
  } catch { return []; }
}
