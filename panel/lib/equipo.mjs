// Ajustes del equipo que solo puede aplicar Windows: el acceso (red de casa, Tailscale) y las carpetas de Windows que
// ve la IA (/pc/<nombre>). El contenedor no toca Windows: el panel deja el pedido en el volumen y el lanzador
// (scripts/arrancar.ps1, también su tarea de cada 5 minutos) lo comprueba, lo aplica recreando el contenedor cuando
// no hay sesiones abiertas (o en seguida, con «ahora») y deja el resultado:
//   $TRABAJO_DIR/equipo/pedido.json     { id, red, tailscale, carpetas, ahora, fecha, quien }   (lo escribe el panel)
//   $TRABAJO_DIR/equipo/resultado.json  { id, fecha, estado: 'aplicado'|'error', mensaje, avisos } (el lanzador)
// Lo que hay ahora lo dice el entorno con que el lanzador creó el contenedor (PANEL_RED, PANEL_DOMINIO,
// NULLRAPTOR_CARPETAS, NULLRAPTOR_LANZADOR).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_CARPETAS = 20;
// Ruta absoluta de Windows: C:\… (sin los caracteres que Windows no admite en rutas). Cada «\» separa exactamente un
// tramo, para que la expresión no pueda hacer vuelta atrás exponencial con textos largos.
const TRAMO = '[^<>:"/\\\\|?*\\x00-\\x1f]+';
const RUTA_WINDOWS = new RegExp(`^[A-Za-z]:\\\\(?:${TRAMO}(?:\\\\${TRAMO})*\\\\?)?$`);
const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });
const leer = (archivo) => { try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return null; } };
const normalizar = (c) => c.trim().replace(/\\+$/, (m, i) => (i === 2 ? '\\' : '')); // C:\a\ → C:\a; C:\ se queda

export class Equipo {
  constructor({ trabajo, env = process.env }) {
    this.dir = path.join(trabajo, 'equipo');
    this.env = env;
  }

  /** Lo que tiene el contenedor ahora mismo. `lanzador`: false si no lo arrancó el lanzador de Windows. */
  actual() {
    const e = this.env;
    return {
      lanzador: e.NULLRAPTOR_LANZADOR === 'windows',
      red: e.PANEL_RED === '1',
      tailscale: Boolean(e.PANEL_DOMINIO),
      dominio: e.PANEL_DOMINIO || null,
      // El lanzador guarda la raíz de una unidad como «D:»; aquí, «D:\» (ruta válida).
      carpetas: (e.NULLRAPTOR_CARPETAS ?? '').split('|').filter(Boolean).map((c) => (/^[A-Za-z]:$/.test(c) ? `${c}\\` : c)),
    };
  }

  estado() {
    const pedido = leer(path.join(this.dir, 'pedido.json'));
    const resultado = leer(path.join(this.dir, 'resultado.json'));
    return { actual: this.actual(), pedido, resultado };
  }

  #escribir(nombre, datos) {
    fs.mkdirSync(this.dir, { recursive: true });
    const archivo = path.join(this.dir, nombre);
    const temporal = `${archivo}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(datos)}\n`);
    fs.renameSync(temporal, archivo);
  }

  /** Deja un pedido para el lanzador. Si coincide con lo que ya hay, no hay nada que pedir (y se retira el anterior). */
  pedir({ red, tailscale, carpetas, ahora = false }, quien = 'este equipo') {
    if (!this.actual().lanzador) throw fallo('Este Nullraptor no lo arrancó el lanzador de Windows: estos ajustes no se pueden aplicar aquí.', 409);
    if (typeof red !== 'boolean' || typeof tailscale !== 'boolean' || typeof ahora !== 'boolean') throw fallo('Pedido no válido.', 400);
    if (!Array.isArray(carpetas) || carpetas.length > MAX_CARPETAS) throw fallo(`Como mucho ${MAX_CARPETAS} carpetas.`, 400);
    const lista = [];
    for (const c of carpetas) {
      if (typeof c !== 'string' || c.length > 260 || !RUTA_WINDOWS.test(c.trim())) throw fallo(`Ruta de Windows no válida: ${String(c).slice(0, 80)} (p. ej. C:\\Users\\tu\\Documentos).`, 400);
      const n = normalizar(c);
      if (!lista.some((x) => x.toLowerCase() === n.toLowerCase())) lista.push(n);
    }
    const a = this.actual();
    const igual = a.red === red && a.tailscale === tailscale && a.carpetas.length === lista.length
      && a.carpetas.every((c, i) => c.toLowerCase() === lista[i].toLowerCase());
    if (igual) { this.cancelar(); return null; }
    const pedido = { id: randomUUID(), red, tailscale, carpetas: lista, ahora, fecha: new Date().toISOString(), quien };
    this.#escribir('pedido.json', pedido);
    return pedido;
  }

  /** Retira el pedido pendiente. False si no había. */
  cancelar() {
    try { fs.rmSync(path.join(this.dir, 'pedido.json')); return true; } catch { return false; }
  }
}
