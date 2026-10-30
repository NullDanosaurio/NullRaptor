// Apoyo de las pruebas de sesiones remotas: carpetas temporales y un `claude` falso (no se abre nada real).
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Remoto } from '../../panel/lib/remoto.mjs';

export function entorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'remoto-'));
  const trabajo = path.join(base, 'trabajo');
  for (const p of ['A', 'B', 'C', 'D']) fs.mkdirSync(path.join(trabajo, 'proyectos', p), { recursive: true });
  fs.writeFileSync(path.join(base, 'fuera'), 'x');
  const configDir = path.join(base, 'claude');
  fs.mkdirSync(configDir);
  return { base, trabajo, configDir, memoria: path.join(base, 'memoria') };
}

export function falso() {
  const lanzados = [];
  const lanzar = (args, opciones) => {
    const hijo = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 4242, exitCode: null, signalCode: null, args, opciones, señales: [] });
    hijo.stdin.setEncoding('utf8');
    hijo.kill = (s) => { hijo.señales.push(s); hijo.signalCode = s; setImmediate(() => hijo.emit('exit', null, s)); return true; };
    lanzados.push(hijo);
    return hijo;
  };
  return { lanzar, lanzados };
}

export function nuevo(e, extra = {}) {
  const f = falso();
  const tamanos = [];
  const env = { AGENTE_CLAVE: 'secreta', CLAUDE_CODE_OAUTH_TOKEN: 'tok', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDECODE: '1', GITHUB_TOKEN: 'gh', HOME: e.base, CREDENCIALES: '/cofre/credenciales.cifrado', PATH: process.env.PATH };
  const remoto = new Remoto({ trabajo: e.trabajo, memoria: e.memoria, env, lanzar: f.lanzar, configDir: e.configDir, tty: () => '/dev/pts/7', cambiarTamano: async (...a) => { tamanos.push(a); }, cortar: (h) => h.kill('SIGTERM'), ...extra });
  return { ...f, tamanos, remoto };
}
