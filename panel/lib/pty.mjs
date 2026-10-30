// Terminal real sin módulos nativos: `script` (util-linux) crea la pseudoterminal y el tamaño se cambia con
// `stty -F` sobre ella (el kernel avisa con SIGWINCH al programa). Solo Linux, que es donde corre el contenedor.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';

export const ptyDisponible = () => process.platform === 'linux' && fs.existsSync('/usr/bin/script');

/** Comillas simples de shell: 'a'\''b'. */
export const comillas = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

export function tamanoValido(cols, filas) {
  return Number.isInteger(cols) && Number.isInteger(filas) && cols >= 20 && cols <= 400 && filas >= 5 && filas <= 200;
}

/** Lanza `orden` (array: programa y argumentos) en una pseudoterminal de cols×filas. */
export function lanzarPty(orden, { cwd, env, cols = 120, filas = 36 }) {
  if (!tamanoValido(cols, filas)) throw new Error('Tamaño de terminal no válido.');
  const comando = `stty cols ${cols} rows ${filas} 2>/dev/null; exec ${orden.map(comillas).join(' ')}`;
  return spawn('script', ['-qfec', comando, '/dev/null'], { cwd, env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** PID del programa que corre dentro de `script` (su único hijo, gracias al exec), o null. */
export function hijoDe(pid) {
  try {
    const [hijo] = fs.readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim().split(/\s+/);
    return /^\d+$/.test(hijo ?? '') ? Number(hijo) : null;
  } catch { return null; }
}

/** Terminal (/dev/pts/N) del programa que corre dentro de `script`, o null si aún no está. */
export function ttyDe(pid) {
  try {
    const hijo = hijoDe(pid);
    const tty = hijo && fs.readlinkSync(`/proc/${hijo}/fd/0`);
    return /^\/dev\/pts\/\d+$/.test(tty) ? tty : null;
  } catch { return null; }
}

/** Cierra la terminal: SIGTERM al programa de dentro (Claude se despide de claude.ai y `script` sale con él;
 * `script` no reenvía SIGHUP). Si en `ms` no ha salido, SIGKILL a los dos. */
export function cortarPty(hijo, ms = 5000) {
  const dentro = hijoDe(hijo.pid);
  try { if (dentro) process.kill(dentro, 'SIGTERM'); else hijo.kill('SIGTERM'); } catch { /* ya terminado */ }
  const duro = setTimeout(() => {
    if (hijo.exitCode !== null || hijo.signalCode !== null) return;
    try { if (dentro) process.kill(dentro, 'SIGKILL'); } catch { /* ya terminado */ }
    hijo.kill('SIGKILL');
  }, ms);
  duro.unref?.();
}

export function redimensionar(tty, cols, filas) {
  return new Promise((resolve, reject) => {
    if (!tamanoValido(cols, filas) || !/^\/dev\/pts\/\d+$/.test(String(tty))) { reject(new Error('Tamaño de terminal no válido.')); return; }
    execFile('stty', ['-F', tty, 'cols', String(cols), 'rows', String(filas)], { timeout: 3000 }, (e) => (e ? reject(e) : resolve()));
  });
}
