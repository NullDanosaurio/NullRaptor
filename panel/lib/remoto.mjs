// Sesiones de Claude Code Remote Control: `claude remote-control` en un proyecto del equipo, para manejarlo desde
// claude.ai/code o la app del móvil. Viven en memoria del panel y mueren con él. Sin terminal propia: solo se lee la
// salida para sacar la URL y el estado. Probado con Claude Code 2.1.308 (no necesita TTY).
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutaProyecto } from './trabajo.mjs';

const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE = path.join(AGENTE, 'node_modules', '.bin', process.platform === 'win32' ? 'claude.cmd' : 'claude');
export const MAX_TOTAL = 3;
export const MAX_MS = 4 * 60 * 60_000;
const COLA = 8 * 1024; // últimos bytes de salida que se guardan (para el motivo si termina)

const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });
// SIGINT es el Ctrl+C documentado: remote-control se despide del servidor. Si muere sin despedirse (p. ej. el panel
// cae y le rompe la salida), la carpeta queda «already served» cerca de un minuto.
const CORTAR = 'SIGINT';
const OCUPADA = 'Esta carpeta aún tiene una sesión remota registrada (se cerró de golpe hace poco): espera un minuto y vuelve a abrirla.';
const sinAnsi = (s) => s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

/** URLs de la salida: la de la sesión (`/code/session_…`) y la del entorno (`/code?environment=…`). */
export function extraerUrls(texto) {
  const urls = String(texto).match(/https:\/\/claude\.ai\/code[^\s\x07\x1b]*/g) ?? [];
  return {
    sesion: urls.findLast((u) => /^https:\/\/claude\.ai\/code\/session_[\w-]+/.test(u)) ?? null,
    entorno: urls.findLast((u) => /^https:\/\/claude\.ai\/code\?environment=[\w-]+$/.test(u)) ?? null,
  };
}

/** Mismo entorno que scripts/preparar.mjs (tokens, BOVEDA_DIR, TRABAJO_DIR), nunca AGENTE_CLAVE. */
export function entornoRemoto(base, { trabajo, memoria, configDir }) {
  const env = { ...base, DISABLE_AUTOUPDATER: '1', TRABAJO_DIR: trabajo };
  if (memoria) env.BOVEDA_DIR = memoria;
  delete env.AGENTE_CLAVE;
  // Como en preparar.mjs: con sesión de claude.ai guardada se usa esa (Remote Control la necesita).
  if (fs.existsSync(path.join(configDir, '.credentials.json'))) delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

/** Marca la carpeta como de confianza en .claude.json (sin eso, remote-control se niega a arrancar). */
export function marcarConfianza(configDir, ruta) {
  const archivo = path.join(configDir, '.claude.json');
  let config = {};
  try { config = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  config.projects ??= {};
  if (config.projects[ruta]?.hasTrustDialogAccepted === true) return false;
  config.projects[ruta] = { ...config.projects[ruta], hasTrustDialogAccepted: true };
  const temporal = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(config, null, 2));
  fs.renameSync(temporal, archivo);
  return true;
}

const lanzarClaude = (args, opciones) => spawn(CLAUDE, args, { ...opciones, windowsHide: true, shell: process.platform === 'win32' });

export class Remoto {
  constructor({ trabajo, memoria = null, env = process.env, lanzar = lanzarClaude, maxTotal = MAX_TOTAL, maxMs = MAX_MS, configDir } = {}) {
    this.trabajo = trabajo;
    this.memoria = memoria;
    this.env = env;
    this.lanzar = lanzar;
    this.maxTotal = maxTotal;
    this.maxMs = maxMs;
    this.configDir = configDir ?? env.CLAUDE_CONFIG_DIR ?? os.homedir();
    this.sesiones = new Map(); // id → { id, proyecto, url, entorno, inicio, estado, motivo, hijo, cola, reloj }
  }

  activas() { return [...this.sesiones.values()].filter((s) => s.estado !== 'terminada'); }

  lista() {
    return [...this.sesiones.values()].map(({ id, proyecto, url, entorno, inicio, estado, motivo }) => ({ id, proyecto, url, entorno, inicio, estado, motivo }));
  }

  /** Abre una sesión en $TRABAJO_DIR/proyectos/<nombre>. Lanza con `codigo` 404, 409 o 429. */
  abrir(nombre) {
    const ruta = rutaProyecto(this.trabajo, nombre); // sin memoria: la bóveda no vale, solo proyectos
    if (!ruta) throw fallo('Proyecto no encontrado en este equipo.', 404);
    if (this.activas().some((s) => s.proyecto === nombre)) throw fallo(`Ya hay una sesión remota abierta en ${nombre}.`, 409);
    if (this.activas().length >= this.maxTotal) throw fallo(`Máximo ${this.maxTotal} sesiones remotas: cierra alguna.`, 429);
    for (const s of this.sesiones.values()) if (s.proyecto === nombre) this.sesiones.delete(s.id); // terminadas antiguas

    marcarConfianza(this.configDir, ruta);
    const env = entornoRemoto(this.env, { trabajo: this.trabajo, memoria: this.memoria, configDir: this.configDir });
    // --capacity 1: una sola sesión por proceso también desde claude.ai. Permisos por defecto (aprueba Dano).
    const hijo = this.lanzar(['remote-control', '--name', `Nullraptor · ${nombre}`, '--capacity', '1'], { cwd: ruta, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const s = { id: randomUUID(), proyecto: nombre, url: null, entorno: null, inicio: new Date().toISOString(), estado: 'conectando', motivo: null, hijo, cola: '', reloj: null };
    let acabar;
    s.fin = new Promise((r) => { acabar = r; });
    this.sesiones.set(s.id, s);

    const terminar = (motivo) => {
      if (s.estado === 'terminada') return;
      clearTimeout(s.reloj);
      s.estado = 'terminada';
      s.motivo ??= motivo;
      s.hijo = null;
    };
    let preguntado = false;
    const leer = (d) => {
      s.cola = (s.cola + d.toString('utf8')).slice(-COLA);
      if (!preguntado && s.cola.includes('Enable Remote Control? (y/n)')) { preguntado = true; hijo.stdin?.write('y\n'); }
      const urls = extraerUrls(s.cola);
      s.url = urls.sesion ?? s.url;
      s.entorno = urls.entorno ?? s.entorno;
      if (s.estado === 'conectando' && /Connected/.test(s.cola)) s.estado = 'conectada';
      // Un error antes de conectar (carpeta ocupada, sin sesión de claude.ai…): se corta ya y se enseña el motivo.
      const error = s.estado === 'conectando' && sinAnsi(s.cola).match(/^Error: .+$/m)?.[0];
      if (error) { terminar(/already served/.test(error) ? OCUPADA : error); hijo.kill(CORTAR); }
    };
    hijo.stdout?.on('data', leer);
    hijo.stderr?.on('data', leer);
    hijo.stdin?.on('error', () => {});
    hijo.on('error', (e) => { terminar(`No se pudo lanzar Claude: ${e.message}`); acabar(); });
    hijo.on('exit', (code) => {
      const ultima = sinAnsi(s.cola).split('\n').map((l) => l.trim()).filter(Boolean).at(-1);
      terminar(code ? (ultima ?? `Claude terminó con código ${code}.`) : 'Claude terminó la sesión.');
      acabar();
    });
    s.reloj = setTimeout(() => this.cerrar(s.id, 'Cerrada sola tras 4 h.'), this.maxMs);
    s.reloj.unref?.();
    return this.lista().find((x) => x.id === s.id);
  }

  /** Cierra y la quita de la lista; con `motivo` (cierre automático) la deja como terminada. False si no existe. */
  cerrar(id, motivo = null) {
    const s = this.sesiones.get(id);
    if (!s) return false;
    if (!motivo || s.estado === 'terminada') this.sesiones.delete(id);
    if (s.estado === 'terminada') return true;
    s.motivo = motivo;
    const hijo = s.hijo;
    clearTimeout(s.reloj);
    s.estado = 'terminada';
    s.hijo = null;
    if (hijo) {
      hijo.kill(CORTAR);
      const duro = setTimeout(() => { if (hijo.exitCode === null && hijo.signalCode === null) hijo.kill('SIGKILL'); }, 5000);
      duro.unref?.();
    }
    return true;
  }

  /** Al parar el panel: todas mueren. Las señales salen ya (vale en process.on('exit')); la promesa espera a que
   * terminen, como mucho `ms`, para que se despidan antes de que el panel salga. */
  cerrarTodas(ms = 5000) {
    const fines = [];
    for (const s of this.sesiones.values()) {
      clearTimeout(s.reloj);
      if (s.hijo) { try { s.hijo.kill(CORTAR); } catch { /* ya terminado */ } fines.push(s.fin); }
      s.hijo = null;
      s.estado = 'terminada';
    }
    return Promise.race([Promise.all(fines), new Promise((r) => setTimeout(r, ms).unref?.())]);
  }
}
