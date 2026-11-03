// Voz del panel: arranca el servicio local de voz (scripts/voz/servidor.py, Whisper + Kokoro en el entorno de
// /estado/sistema/voz, que crea scripts/voz-instalar.sh) la primera vez que hace falta y le pasa las peticiones.
// El servicio escucha solo en 127.0.0.1; el panel es la puerta, con sus controles de acceso. Sin dependencias.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });

/** Petición HTTP al servicio. Devuelve { estado, tipo, cuerpo: Buffer }. */
export function pedirServicio(puerto, metodo, ruta, { cuerpo = null, cabeceras = {}, ms = 120_000 } = {}) {
  return new Promise((listo, mal) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { ...cabeceras, ...(cuerpo ? { 'Content-Length': cuerpo.length } : {}) } }, (res) => {
      const trozos = [];
      res.on('data', (t) => trozos.push(t));
      res.on('end', () => listo({ estado: res.statusCode, tipo: res.headers['content-type'] ?? '', cuerpo: Buffer.concat(trozos) }));
      res.on('error', mal);
    });
    req.setTimeout(ms, () => req.destroy(new Error('El servicio de voz no contesta.')));
    req.on('error', mal);
    req.end(cuerpo ?? undefined);
  });
}

/** Texto para leer en voz alta: sin Markdown, sin bloques de código ni direcciones (se nombran, no se deletrean). */
export function paraHablar(texto) {
  return String(texto ?? '')
    .replace(/```[\s\S]*?```/g, ' (código omitido) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!?\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'un enlace')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_~>#|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

export class Voz {
  constructor({ dir = process.env.NULLRAPTOR_VOZ ?? '/estado/sistema/voz', puerto = Number(process.env.NULLRAPTOR_VOZ_PUERTO ?? 4330), lanzar = null, esperaMs = 30_000 } = {}) {
    Object.assign(this, { dir, puerto, esperaMs });
    this.python = path.join(dir, 'venv', 'bin', 'python');
    this.lanzar = lanzar ?? (() => spawn(this.python, [path.join(AGENTE, 'scripts', 'voz', 'servidor.py'), '--precargar'], {
      env: { ...process.env, NULLRAPTOR_VOZ: dir, NULLRAPTOR_VOZ_PUERTO: String(puerto) }, stdio: ['ignore', 'ignore', 'inherit'],
    }));
    this.hijo = null;
    this.arrancando = null;
  }

  instalada() {
    return fs.existsSync(this.python) && fs.existsSync(path.join(this.dir, 'modelos', 'kokoro-v1.0.onnx'));
  }

  async #responde() {
    try { return (await pedirServicio(this.puerto, 'GET', '/estado', { ms: 2000 })).estado === 200; } catch { return false; }
  }

  /** Deja el servicio en marcha (lo arranca si hace falta y espera a que conteste). */
  async asegurar() {
    if (!this.instalada()) throw fallo('La voz no está instalada: sh /nullraptor/scripts/voz-instalar.sh', 503);
    if (await this.#responde()) return;
    this.arrancando ??= (async () => {
      if (!this.hijo || this.hijo.exitCode !== null) {
        this.hijo = this.lanzar();
        this.hijo.on?.('exit', () => { this.hijo = null; });
      }
      for (const fin = Date.now() + this.esperaMs; Date.now() < fin;) {
        if (await this.#responde()) return;
        await new Promise((r) => setTimeout(r, 300));
      }
      throw fallo('El servicio de voz no arrancó a tiempo.', 503);
    })().finally(() => { this.arrancando = null; });
    await this.arrancando;
  }

  async estado() {
    if (!this.instalada()) return { instalada: false, enMarcha: false };
    return { instalada: true, enMarcha: await this.#responde() };
  }

  async transcribir(audio, idioma = 'es') {
    if (!audio?.length) throw fallo('No llegó audio.', 400);
    await this.asegurar();
    const r = await pedirServicio(this.puerto, 'POST', '/transcribir', { cuerpo: audio, cabeceras: { 'Content-Type': 'application/octet-stream', 'X-Idioma': /^[a-z]{2}$/.test(idioma) ? idioma : 'es' } });
    const j = JSON.parse(r.cuerpo.toString('utf8'));
    if (r.estado !== 200) throw fallo(j.error ?? 'No se pudo transcribir.', 502);
    return { texto: j.texto };
  }

  /** Texto → WAV (Buffer). */
  async hablar(texto, { voz, velocidad } = {}) {
    const limpio = paraHablar(texto);
    if (!limpio) throw fallo('Falta el texto.', 400);
    await this.asegurar();
    const r = await pedirServicio(this.puerto, 'POST', '/hablar', { cuerpo: Buffer.from(JSON.stringify({ texto: limpio.slice(0, 4000), voz, velocidad })), cabeceras: { 'Content-Type': 'application/json' } });
    if (r.estado !== 200) throw fallo(JSON.parse(r.cuerpo.toString('utf8')).error ?? 'No se pudo hablar.', 502);
    return r.cuerpo;
  }

  parar() { try { this.hijo?.kill('SIGTERM'); } catch { /* ya parado */ } }
}
