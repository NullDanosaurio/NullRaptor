// Chats del panel: conversaciones abiertas (en memoria del servidor) y chats guardados en $TRABAJO_DIR/chats.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Chat, DIAS_LOCAL, NOMBRE } from '../../scripts/chat.mjs';

const MAX_ABIERTOS = 8;
const QUIEN = Object.fromEntries(Object.entries(NOMBRE).map(([k, v]) => [v, k]));

export class Chats {
  constructor({ trabajo, memoria }) {
    this.carpeta = path.join(trabajo, 'chats');
    this.memoria = memoria;
    this.abiertos = new Map(); // id → { chat, clientes: Set<res>, creado }
  }

  crear(ruta) {
    if (this.abiertos.size >= MAX_ABIERTOS) throw new Error(`Máximo ${MAX_ABIERTOS} chats abiertos: cierra alguno.`);
    const id = randomUUID();
    const chat = new Chat({ ruta, carpeta: this.carpeta });
    const entrada = { chat, clientes: new Set(), creado: new Date().toISOString() };
    const emitir = (tipo) => (datos) => { for (const res of entrada.clientes) enviarEvento(res, tipo, datos); };
    chat.on('mensaje', emitir('mensaje'));
    chat.on('escribiendo', emitir('escribiendo'));
    chat.on('fallo', emitir('fallo'));
    this.abiertos.set(id, entrada);
    return id;
  }

  resumen(id) {
    const e = this.abiertos.get(id);
    if (!e) return null;
    const { chat } = e;
    return { id, proyecto: chat.proyecto.nombre, creado: e.creado, historial: chat.historial, escribiendo: chat.escribiendo, ocupado: chat.ocupado };
  }

  lista() {
    return [...this.abiertos.keys()].map((id) => {
      const r = this.resumen(id);
      return { id, proyecto: r.proyecto, creado: r.creado, mensajes: r.historial.length, ocupado: r.ocupado };
    });
  }

  /** Suscribe una respuesta SSE: primero el estado completo, luego los eventos. */
  suscribir(id, res) {
    const e = this.abiertos.get(id);
    if (!e) return false;
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    enviarEvento(res, 'estado', this.resumen(id));
    e.clientes.add(res);
    const latido = setInterval(() => res.write(': latido\n\n'), 25_000);
    res.on('close', () => { clearInterval(latido); e.clientes.delete(res); });
    return true;
  }

  /** Envía en segundo plano: las respuestas llegan por SSE. Lanza si el chat no existe o está ocupado. */
  enviar(id, texto) {
    const e = this.abiertos.get(id);
    if (!e) throw Object.assign(new Error('Ese chat ya no está abierto.'), { codigo: 404 });
    if (e.chat.ocupado) throw Object.assign(new Error('Espera a que terminen de contestar.'), { codigo: 409 });
    e.chat.enviar(texto).catch((err) => { for (const res of e.clientes) enviarEvento(res, 'fallo', { quien: 'dano', texto: err.message }); });
  }

  async cerrar(id) {
    const e = this.abiertos.get(id);
    if (!e) return null;
    if (e.chat.ocupado) throw Object.assign(new Error('Espera a que terminen de contestar antes de cerrar.'), { codigo: 409 });
    this.abiertos.delete(id);
    const r = await e.chat.cerrar(this.memoria);
    for (const res of e.clientes) { enviarEvento(res, 'cerrado', r); res.end(); }
    return { ...r, registro: r.registro ? path.basename(r.registro) : null };
  }

  /** Chats guardados en el equipo (más recientes primero). */
  guardados() {
    try {
      return fs.readdirSync(this.carpeta).filter((f) => f.endsWith('.md')).map((f) => {
        const st = fs.statSync(path.join(this.carpeta, f));
        const m = f.match(/^(.+)-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
        return { archivo: f, proyecto: m?.[1] ?? f, fecha: m ? `${m[2]}T${m[3]}:${m[4]}` : null, cambiado: st.mtimeMs, bytes: st.size };
      }).sort((a, b) => b.cambiado - a.cambiado);
    } catch { return []; }
  }

  /** Lee un chat guardado como lista de mensajes. Solo nombres de archivo de la carpeta (sin rutas). */
  leerGuardado(archivo) {
    if (typeof archivo !== 'string' || !/^[\w.-]+\.md$/.test(archivo)) return null;
    const ruta = path.join(this.carpeta, archivo);
    let texto;
    try { texto = fs.readFileSync(ruta, 'utf8'); } catch { return null; }
    const mensajes = [];
    for (const bloque of texto.split(/\n\n(?=\*\*(?:Dano|Claude|Codex):\*\* )/)) {
      const m = bloque.match(/^\*\*(Dano|Claude|Codex):\*\* ([\s\S]*)$/);
      if (m) mensajes.push({ quien: QUIEN[m[1]], texto: m[2].trim() });
      else if (mensajes.length) mensajes.at(-1).texto += `\n\n${bloque.trim()}`;
    }
    return { archivo, dias: DIAS_LOCAL, mensajes };
  }
}

export function enviarEvento(res, tipo, datos) {
  res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos ?? null)}\n\n`);
}
