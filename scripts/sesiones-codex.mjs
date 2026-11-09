// Historial de desarrollo de Codex: metadatos nativos, sin leer conversaciones ni incluir chats de consulta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { guardarPrivado } from './codex-config.mjs';

export const idCodexValido = (id) => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const casaCodex = (env) => env.CODEX_HOME ?? path.join(env.HOME ?? os.homedir(), '.codex');

export function sesionesCodex(env = process.env) {
  const sesiones = [];
  const visitar = (dir, nivel = 0) => {
    if (nivel > 4) return;
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      const archivo = path.join(dir, e.name);
      if (e.isDirectory()) visitar(archivo, nivel + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) {
        let fd;
        try {
          fd = fs.openSync(archivo, 'r');
          const b = Buffer.alloc(64 * 1024);
          const n = fs.readSync(fd, b, 0, b.length, 0);
          const dato = JSON.parse(b.toString('utf8', 0, n).split('\n')[0]);
          const m = dato.payload;
          if (dato.type === 'session_meta' && idCodexValido(m?.id)) sesiones.push({ id: m.id, cwd: m.cwd, inicio: m.timestamp ?? dato.timestamp, source: m.source });
        } catch { /* Un archivo incompleto no impide listar los demás. */ }
        finally { if (fd !== undefined) fs.closeSync(fd); }
      }
    }
  };
  visitar(path.join(casaCodex(env), 'sessions'));
  return sesiones.sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
}

export function argsDesarrolloCodex({ ruta, adjuntos, memoria = null, sesion = null, continuar = false, instrucciones = '', configuracion = [], aviso = null }) {
  const args = ['--no-daemon', '--sandbox', 'workspace-write', '--ask-for-approval', 'on-request', '-C', ruta,
    '--add-dir', adjuntos, ...configuracion];
  if (instrucciones) args.push('-c', `developer_instructions=${JSON.stringify(instrucciones)}`);
  if (memoria) args.push('--add-dir', memoria);
  // Igual que el relevo: permitir commits solo en el git del proyecto (los worktrees usan un archivo .git).
  if (fs.existsSync(path.join(ruta, '.git')) && fs.statSync(path.join(ruta, '.git')).isDirectory()) args.push('--add-dir', path.join(ruta, '.git'));
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
