// Registro de seguridad del panel en el volumen ($TRABAJO_DIR/registros): accesos (entradas con passkey, fallos,
// altas) y cada sesión de terminal entera (lo que entra y lo que sale). Aviso opcional al móvil con ntfy
// (AVISO_NTFY = URL del tema, en el cofre): solo un texto corto, nunca el contenido de la terminal.
import fs from 'node:fs';
import path from 'node:path';

const MAX_SESION = 50 * 1024 * 1024; // por sesión de terminal; a partir de ahí se deja de guardar la salida

export class Registro {
  constructor({ carpeta, avisoUrl = null, ahora = () => new Date() }) {
    this.carpeta = carpeta;
    this.avisoUrl = avisoUrl;
    this.ahora = ahora;
  }

  linea(archivo, datos) {
    try {
      fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
      fs.appendFileSync(archivo, `${JSON.stringify({ t: this.ahora().toISOString(), ...datos })}\n`, { mode: 0o600 });
    } catch (e) { console.error(`[panel] no se pudo escribir el registro: ${e.message}`); }
  }

  /** Entradas, fallos, altas y bajas de passkeys, aperturas de terminal… */
  acceso(datos) { this.linea(path.join(this.carpeta, 'accesos.jsonl'), datos); }

  /** Registro de una sesión de terminal: devuelve una función (tipo, datos) para ir añadiendo. */
  sesion(id, proyecto) {
    const fecha = this.ahora().toISOString().replace(/:/g, '-').slice(0, 19);
    const archivo = path.join(this.carpeta, 'terminal', `${fecha}-${proyecto.replace(/[^\w.-]/g, '_')}-${id.slice(0, 8)}.jsonl`);
    let tam = 0;
    return (tipo, datos = {}) => {
      if (tipo === 'salida' && tam > MAX_SESION) return;
      const extra = tipo === 'salida' || tipo === 'entrada' ? { datos: String(datos) } : datos;
      tam += extra.datos?.length ?? 0;
      this.linea(archivo, { tipo, ...extra });
    };
  }

  aviso(texto) {
    if (!this.avisoUrl) return;
    fetch(this.avisoUrl, { method: 'POST', body: texto, headers: { Title: 'Nullraptor', Tags: 'lock' }, signal: AbortSignal.timeout(5000) })
      .catch((e) => console.error(`[panel] aviso no enviado: ${e.message}`));
  }
}
