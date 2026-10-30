// Sesiones remotas: Claude Code interactivo con Remote Control (`claude --remote-control`) en un proyecto del equipo,
// dentro de una terminal real (pty.mjs). Se ve y se maneja desde la terminal del panel y, a la vez, desde
// claude.ai/code o la app del móvil. Solo Claude Code, nunca una shell: cada acción pasa por sus permisos
// (modo manual: pregunta siempre) y unas reglas deny protegen cofre, credenciales, passkeys y registros.
// Viven en memoria del panel y mueren con él. Probado con Claude Code 2.1.308.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cortarPty, lanzarPty, redimensionar, tamanoValido, ttyDe } from './pty.mjs';
import { rutaProyecto } from './trabajo.mjs';
import { ARCHIVO_MCP } from '../../scripts/ia.mjs';

const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE = path.join(AGENTE, 'node_modules', '.bin', 'claude');
export const MAX_TOTAL = 3;
export const MAX_MS = 4 * 60 * 60_000;
const MAX_PANTALLA = 512 * 1024; // lo último de la terminal, para repintarla al conectarse
const MAX_ENTRADA = 64 * 1024;

const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });
const sinAnsi = (s) => s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?<>=]*[ -/]*[@-~]/g, '');

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
  // Marcas de una sesión de Claude que lanzara el panel (en desarrollo): el hijo se creería subsesión.
  for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || k === 'CLAUDE_PID' || (k.startsWith('CLAUDE_CODE_') && k !== 'CLAUDE_CODE_OAUTH_TOKEN')) delete env[k];
  // Como en preparar.mjs: con sesión de claude.ai guardada se usa esa (Remote Control la necesita).
  if (fs.existsSync(path.join(configDir, '.credentials.json'))) delete env.CLAUDE_CODE_OAUTH_TOKEN;
  return env;
}

/** Reglas deny de la terminal (se suman a la configuración del usuario y mandan sobre sus allow). */
export function ajustesTerminal({ env, configDir, trabajo }) {
  const abs = (p) => `/${path.resolve(p)}`; // «//ruta» = ruta absoluta en los permisos de Claude Code
  const cofre = path.dirname(path.resolve(env.CREDENCIALES ?? path.join(os.homedir(), '.nullraptor', 'credenciales.cifrado')));
  const nullraptor = path.join(env.HOME ?? os.homedir(), '.nullraptor');
  const protegidos = [`${abs(cofre)}/**`, `${abs(nullraptor)}/**`, abs(path.join(configDir, '.credentials.json')), abs(path.join(configDir, '.claude.json')), `${abs(path.join(trabajo, 'registros'))}/**`];
  return {
    permissions: {
      deny: [
        ...protegidos.flatMap((p) => [`Read(${p})`, `Edit(${p})`]), // Edit cubre también escribir
        'Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(rm -rf /:*)', 'Bash(rm -rf ~:*)',
      ],
    },
  };
}

/** Marca la carpeta como de confianza en .claude.json (sin eso, Claude pregunta o se niega). */
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

const lanzarClaude = (args, opciones) => lanzarPty([CLAUDE, ...args], opciones);
const sse = (res, tipo, datos) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos ?? null)}\n\n`);

export class Remoto {
  constructor({ trabajo, memoria = null, env = process.env, lanzar = lanzarClaude, maxTotal = MAX_TOTAL, maxMs = MAX_MS, configDir, registro = null, tty = ttyDe, cambiarTamano = redimensionar, cortar = cortarPty } = {}) {
    Object.assign(this, { trabajo, memoria, env, lanzar, maxTotal, maxMs, registro, tty, cambiarTamano, cortar });
    this.configDir = configDir ?? env.CLAUDE_CONFIG_DIR ?? os.homedir();
    this.sesiones = new Map(); // id → { id, proyecto, url, entorno, inicio, estado, motivo, hijo, pantalla, clientes, reloj, fin, apunte }
  }

  activas() { return [...this.sesiones.values()].filter((s) => s.estado !== 'terminada'); }

  lista() {
    return [...this.sesiones.values()].map(({ id, proyecto, url, entorno, inicio, estado, motivo, quien }) => ({ id, proyecto, url, entorno, inicio, estado, motivo, quien }));
  }

  /** Abre Claude en $TRABAJO_DIR/proyectos/<nombre>. Lanza con `codigo` 404, 409 o 429. */
  abrir(nombre, { quien = 'este equipo', cols = 120, filas = 36 } = {}) {
    const ruta = rutaProyecto(this.trabajo, nombre); // sin memoria: la bóveda no vale, solo proyectos
    if (!ruta) throw fallo('Proyecto no encontrado en este equipo.', 404);
    if (this.activas().some((s) => s.proyecto === nombre)) throw fallo(`Ya hay una sesión remota abierta en ${nombre}.`, 409);
    if (this.activas().length >= this.maxTotal) throw fallo(`Máximo ${this.maxTotal} sesiones remotas: cierra alguna.`, 429);
    if (!tamanoValido(cols, filas)) [cols, filas] = [120, 36];
    for (const s of this.sesiones.values()) if (s.proyecto === nombre) this.sesiones.delete(s.id); // terminadas antiguas

    marcarConfianza(this.configDir, ruta);
    const env = entornoRemoto(this.env, { trabajo: this.trabajo, memoria: this.memoria, configDir: this.configDir });
    const ajustes = JSON.stringify(ajustesTerminal({ env, configDir: this.configDir, trabajo: this.trabajo }));
    const args = ['--remote-control', `Nullraptor · ${nombre}`, '--permission-mode', 'manual', '--settings', ajustes];
    // MCP (Ruflo y los autorizados) desde fuera del proyecto: lo prepara scripts/ia.mjs al arrancar.
    const mcp = path.join(this.trabajo, ARCHIVO_MCP);
    if (fs.existsSync(mcp)) args.push('--mcp-config', mcp);
    const hijo = this.lanzar(args, { cwd: ruta, env, cols, filas });
    const id = randomUUID();
    const s = { id, proyecto: nombre, url: null, entorno: null, inicio: new Date().toISOString(), estado: 'conectando', motivo: null, quien, hijo, pantalla: '', clientes: new Set(), reloj: null };
    s.apunte = this.registro?.sesion(id, nombre) ?? (() => {});
    s.apunte('apertura', { proyecto: nombre, quien, args: args.slice(0, 4) });
    let acabar;
    s.fin = new Promise((r) => { acabar = r; });
    this.sesiones.set(id, s);

    hijo.stdout?.setEncoding?.('utf8');
    hijo.stderr?.setEncoding?.('utf8');
    const leer = (d) => {
      const texto = String(d);
      s.pantalla = (s.pantalla + texto).slice(-MAX_PANTALLA);
      s.apunte('salida', texto);
      for (const res of s.clientes) sse(res, 'datos', texto);
      if (!s.url) {
        const urls = extraerUrls(s.pantalla);
        s.url = urls.sesion;
        s.entorno = urls.entorno ?? s.entorno;
        if (s.url && s.estado === 'conectando') s.estado = 'conectada';
      }
    };
    hijo.stdout?.on('data', leer);
    hijo.stderr?.on('data', leer);
    hijo.stdin?.on('error', () => {});
    const terminar = (motivo) => {
      if (s.estado !== 'terminada') { clearTimeout(s.reloj); s.estado = 'terminada'; s.motivo ??= motivo; s.hijo = null; }
      for (const res of s.clientes) { sse(res, 'fin', { motivo: s.motivo }); res.end(); }
      s.clientes.clear();
    };
    hijo.on('error', (e) => { terminar(`No se pudo lanzar Claude: ${e.message}`); acabar(); });
    hijo.on('exit', (code) => {
      const ultima = sinAnsi(s.pantalla).split(/\r?\n|\r/).map((l) => l.trim()).filter(Boolean).at(-1);
      terminar(code ? (ultima ?? `Claude terminó con código ${code}.`) : 'Claude terminó la sesión.');
      s.apunte('cierre', { motivo: s.motivo, codigo: code });
      acabar();
    });
    s.reloj = setTimeout(() => this.cerrar(id, 'Cerrada sola tras 4 h.'), this.maxMs);
    s.reloj.unref?.();
    return this.lista().find((x) => x.id === id);
  }

  viva(id) {
    const s = this.sesiones.get(id);
    if (!s || s.estado === 'terminada' || !s.hijo) throw fallo('Esa sesión remota ya no está abierta.', 404);
    return s;
  }

  /** Pantalla en vivo por SSE: primero lo último que hubo, luego cada trozo nuevo. */
  suscribir(id, res, quien) {
    const s = this.viva(id);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    sse(res, 'pantalla', s.pantalla);
    s.clientes.add(res);
    s.apunte('mirando', { quien });
    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
    latido.unref?.();
    res.on('close', () => { clearInterval(latido); s.clientes.delete(res); });
  }

  /** Teclas desde la terminal del panel. */
  escribir(id, datos, quien) {
    if (typeof datos !== 'string' || !datos || datos.length > MAX_ENTRADA) throw fallo('Entrada no válida.', 400);
    const s = this.viva(id);
    s.apunte('entrada', datos);
    if (quien !== s.ultimoQuien) { s.ultimoQuien = quien; s.apunte('escribe', { quien }); }
    s.hijo.stdin.write(datos);
  }

  async tamano(id, cols, filas) {
    if (!tamanoValido(cols, filas)) throw fallo('Tamaño de terminal no válido.', 400);
    const s = this.viva(id);
    s.tty ??= this.tty(s.hijo.pid);
    if (!s.tty) throw fallo('La terminal aún no está lista.', 409);
    await this.cambiarTamano(s.tty, cols, filas);
  }

  /** Cierra y la quita de la lista; con `motivo` (cierre automático) la deja como terminada. False si no existe. */
  cerrar(id, motivo = null) {
    const s = this.sesiones.get(id);
    if (!s) return false;
    if (!motivo || s.estado === 'terminada') this.sesiones.delete(id);
    if (s.estado === 'terminada') return true;
    s.motivo = motivo ?? 'Cerrada desde el panel.';
    const hijo = s.hijo;
    clearTimeout(s.reloj);
    s.estado = 'terminada';
    s.hijo = null;
    if (hijo) this.cortar(hijo);
    return true;
  }

  /** Al parar el panel: todas mueren. Las señales salen ya (vale en process.on('exit')); la promesa espera a que
   * terminen, como mucho `ms`, para que se despidan antes de que el panel salga. */
  cerrarTodas(ms = 5000) {
    const fines = [];
    for (const s of this.sesiones.values()) {
      clearTimeout(s.reloj);
      if (s.hijo) { this.cortar(s.hijo); fines.push(s.fin); }
      s.hijo = null;
      s.estado = 'terminada';
    }
    return Promise.race([Promise.all(fines), new Promise((r) => setTimeout(r, ms).unref?.())]);
  }
}
