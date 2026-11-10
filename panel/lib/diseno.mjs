// Diseño del Resumen: el orden de los widgets, guardado en <trabajo>/panel/diseno.json (fuera de proyectos/ y de
// la lista de copias, así que no se toma por proyecto).
import fs from 'node:fs';
import path from 'node:path';

/** Lista cerrada de widgets; el orden de aquí es el orden por defecto. */
export const IDS = ['cifras', 'avance', 'avisos', 'tareas', 'proyectos', 'mcp', 'gasto', 'boveda-buscar', 'boveda-cambios', 'chats'];

export class Diseno {
  constructor({ trabajo }) {
    this.dir = path.join(trabajo, 'panel');
    this.archivo = path.join(this.dir, 'diseno.json');
  }

  /** Descarta lo desconocido y repetido y añade al final lo que falte. */
  normalizar(orden) {
    const lista = Array.isArray(orden) ? orden : [];
    const vistos = new Set();
    for (const id of lista) if (IDS.includes(id)) vistos.add(id);
    for (const id of IDS) vistos.add(id);
    return [...vistos];
  }

  /** Nunca lanza ni escribe: si el archivo falta o no sirve, el orden por defecto. */
  leer() {
    let orden = null;
    try { orden = JSON.parse(fs.readFileSync(this.archivo, 'utf8'))?.orden; } catch { /* por defecto */ }
    return { orden: this.normalizar(orden) };
  }

  guardar(orden) {
    const normal = this.normalizar(orden);
    fs.mkdirSync(this.dir, { recursive: true });
    const temporal = `${this.archivo}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporal, `${JSON.stringify({ orden: normal })}\n`);
      fs.renameSync(temporal, this.archivo);
    } catch (error) {
      fs.rmSync(temporal, { force: true });
      throw error;
    }
    return normal;
  }
}
