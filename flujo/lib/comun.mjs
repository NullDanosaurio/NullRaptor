// Utilidades del coordinador: rutas, procesos hijos con cancelación, git y bloqueo.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// RAIZ = proyecto sobre el que se trabaja (FLUJO_PROYECTO o directorio actual); AGENTE = este repositorio.
// Las herramientas de IA salen del agente; las de compilar y probar, del propio proyecto.
export const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RAIZ = path.resolve(process.env.FLUJO_PROYECTO ?? process.cwd());
export const RUNS = path.join(RAIZ, '.runs');
export const WORKTREES = path.join(RAIZ, '.worktrees');
export const MIN = 60_000;
// shortcut: comprobaciones de un proyecto Next.js + TypeScript + Playwright (la tienda); generalizar con el segundo tipo de proyecto.
export const BIN = {
  node: process.execPath,
  tsc: path.join(RAIZ, 'node_modules/typescript/bin/tsc'),
  next: path.join(RAIZ, 'node_modules/next/dist/bin/next'),
  playwright: path.join(RAIZ, 'node_modules/@playwright/test/cli.js'),
  claude: path.join(AGENTE, 'node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
  ruflo: path.join(AGENTE, 'node_modules/ruflo/bin/ruflo.js'),
  codex: buscarCodex(),
};

// Codex se actualiza solo y cambia de carpeta: si la ruta heredada ya no existe, usa el codex.exe más reciente.
function buscarCodex() {
  const heredada = process.env.RUFLO_CODEX_EXE;
  if (heredada && fs.existsSync(heredada)) return heredada;
  const bin = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  let candidatos = [];
  try {
    candidatos = fs.readdirSync(bin)
      .map((d) => path.join(bin, d, 'codex.exe'))
      .filter((f) => fs.existsSync(f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  } catch {}
  return candidatos[0] ?? 'codex';
}
const BLOQUEO = path.join(RUNS, 'flujo.lock');
const CANCELAR = path.join(RUNS, 'cancelar');

export class ErrorInfra extends Error {}
export class Cancelado extends Error {}

export const paso = (msg) => console.log(`[flujo] ${msg}`);
export const recortar = (texto, max) => (texto.length > max ? `…${texto.slice(-max)}` : texto);
export const sha256 = (archivo) => createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
export const marcaTiempo = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

export function git(args, cwd = RAIZ) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new ErrorInfra(`git ${args.join(' ')}: ${(r.stderr || r.stdout || '').trim()}`);
  return r.stdout.trimEnd();
}

// Entorno de los hijos: sin claves de Stripe ni claves API (se usan las suscripciones).
export function entornoSeguro() {
  const env = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    npm_config_update_notifier: 'false',
    FLUJO_RAIZ: RAIZ,
  };
  // Navegadores locales del proyecto si los tiene; si no, los del equipo (npx playwright install).
  const navegadores = path.join(RAIZ, '.tools', 'ms-playwright');
  if (fs.existsSync(navegadores)) env.PLAYWRIGHT_BROWSERS_PATH = navegadores;
  for (const clave of Object.keys(env)) {
    if (/^(STRIPE_|ANTHROPIC_API_KEY$|OPENAI_API_KEY$)/i.test(clave)) delete env[clave];
  }
  return env;
}

// --- Cancelación -----------------------------------------------------------------
const hijosActivos = new Set();
let cancelado = false;

function matar(hijo) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(hijo.pid), '/t', '/f'], { windowsHide: true });
  else hijo.kill('SIGKILL');
}

export function cancelar(motivo) {
  if (cancelado) return;
  cancelado = true;
  paso(`Cancelando: ${motivo}`);
  for (const hijo of hijosActivos) matar(hijo);
}

export function comprobarCancelacion() {
  if (!cancelado && fs.existsSync(CANCELAR)) cancelar('solicitud en .runs/cancelar');
  if (cancelado) throw new Cancelado('Ejecución cancelada');
}

export function solicitarCancelacion() {
  fs.mkdirSync(RUNS, { recursive: true });
  fs.writeFileSync(CANCELAR, new Date().toISOString());
}

process.on('SIGINT', () => cancelar('Ctrl+C'));

/** Ejecuta un proceso con límite de tiempo, registro y cancelación. */
export function ejecutar(cmd, args, { cwd, timeoutMs, entrada, log, env }) {
  return new Promise((resolve) => {
    const inicio = Date.now();
    let out = '';
    let err = '';
    let terminado = false;
    const hijo = spawn(cmd, args, { cwd, env: env ?? entornoSeguro(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    hijosActivos.add(hijo);
    const visibles = args.map((a) => (a.length > 120 ? '<…>' : a)).join(' ');
    // Registro en vivo para el monitor: crece mientras el proceso trabaja y se
    // borra al terminar (el registro definitivo es `log`).
    const vivo = log ? path.join(path.dirname(log), 'en-curso.log') : null;
    const anotar = (texto) => {
      if (!vivo) return;
      try {
        fs.appendFileSync(vivo, texto);
      } catch {
        // el registro en vivo es informativo: nunca interrumpe la ejecución
      }
    };
    if (vivo) {
      try {
        fs.writeFileSync(vivo, `$ ${path.basename(cmd)} ${visibles}\n`);
      } catch {
        // idem
      }
    }
    const fin = (code) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      clearInterval(vigilante);
      hijosActivos.delete(hijo);
      if (log) fs.writeFileSync(log, `$ ${path.basename(cmd)} ${visibles}\n\n--- stdout ---\n${out}\n--- stderr ---\n${err}\n`);
      if (vivo) fs.rmSync(vivo, { force: true });
      resolve({ code, out, err, ms: Date.now() - inicio, cancelado });
    };
    const reloj = setTimeout(() => {
      err += `\n[flujo] Tiempo agotado (${timeoutMs / 1000} s)`;
      matar(hijo);
    }, timeoutMs);
    const vigilante = setInterval(() => {
      if (fs.existsSync(CANCELAR)) cancelar('solicitud en .runs/cancelar');
    }, 1000);
    hijo.stdout.on('data', (d) => {
      out += d;
      anotar(d);
    });
    hijo.stderr.on('data', (d) => {
      err += d;
      anotar(d);
    });
    hijo.on('error', (e) => {
      err += `\n[flujo] ${e.message}`;
      fin(1);
    });
    hijo.on('close', (code) => fin(code ?? 1));
    hijo.stdin.on('error', () => {});
    hijo.stdin.end(entrada ?? '');
  });
}

// --- Instancia única con detección de bloqueos huérfanos -------------------------------
export function procesoVivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Devuelve el bloqueo huérfano encontrado (si lo había) para que se recupere. */
export function adquirirBloqueo(id, comando) {
  fs.mkdirSync(RUNS, { recursive: true });
  let huerfano = null;
  if (fs.existsSync(BLOQUEO)) {
    let previo;
    try {
      previo = JSON.parse(fs.readFileSync(BLOQUEO, 'utf8'));
    } catch {
      previo = { id: fs.readFileSync(BLOQUEO, 'utf8').trim(), pid: 0 };
    }
    if (previo.pid && procesoVivo(previo.pid)) {
      throw new Error(`Ya hay un flujo en marcha (${previo.id}, proceso ${previo.pid}). Usa «cancelar» si quieres detenerlo.`);
    }
    huerfano = previo;
    fs.rmSync(BLOQUEO, { force: true });
  }
  fs.rmSync(CANCELAR, { force: true });
  fs.writeFileSync(BLOQUEO, JSON.stringify({ id, pid: process.pid, inicio: new Date().toISOString(), comando }), { flag: 'wx' });
  return huerfano;
}

export function liberarBloqueo() {
  fs.rmSync(BLOQUEO, { force: true });
  fs.rmSync(CANCELAR, { force: true });
}

export function leerBloqueo() {
  try {
    return JSON.parse(fs.readFileSync(BLOQUEO, 'utf8'));
  } catch {
    return null;
  }
}

/** Guarda un valor en la memoria de Ruflo. Nunca interrumpe el flujo si falla. */
export function registrarEnRuflo(namespace, clave, valor) {
  const r = spawnSync(BIN.node, [
    BIN.ruflo, 'memory', 'store', '-k', clave, '--value', JSON.stringify(valor),
    '-n', namespace, '--provenance', 'tool_result', '--no-embedding',
  ], { cwd: AGENTE, encoding: 'utf8', env: entornoSeguro(), timeout: 2 * MIN, windowsHide: true }); // memoria en el agente, no en el proyecto
  if (r.status === 0) return true;
  paso(`Aviso: no se pudo guardar en Ruflo (${namespace}/${clave}): ${(r.stderr || r.stdout || r.error?.message || '').trim().slice(0, 200)}`);
  return false;
}
