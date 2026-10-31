// Actualización automática del equipo. La tarea programada de Windows (scripts/arrancar.ps1 -Actualizar) y el panel
// se hablan con archivos en $TRABAJO_DIR/actualizacion (dentro del volumen):
//   panel.json       lo escribe el panel cada poco: cuántas sesiones hay abiertas (terminales y chats).
//   disponible.json  lo escribe la tarea cuando hay una imagen nueva: { imagen, fecha }.
//   solicitada.json  lo escribe el panel cuando Daniel pulsa «Actualizar ahora».
// La tarea recrea el contenedor si no hay sesiones abiertas o si se ha pedido; si no, el panel avisa.
import fs from 'node:fs';
import path from 'node:path';

const leer = (archivo) => { try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return null; } };

export class Actualizacion {
  constructor({ trabajo, ahora = () => new Date() }) {
    this.dir = path.join(trabajo, 'actualizacion');
    this.ahora = ahora;
  }

  #escribir(nombre, datos) {
    fs.mkdirSync(this.dir, { recursive: true });
    const archivo = path.join(this.dir, nombre);
    const temporal = `${archivo}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(datos)}\n`);
    fs.renameSync(temporal, archivo);
  }

  /** Lo que la tarea necesita saber para no cortar a nadie. */
  publicar(sesiones) {
    this.#escribir('panel.json', { sesiones, fecha: this.ahora().toISOString() });
  }

  estado() {
    const d = leer(path.join(this.dir, 'disponible.json'));
    const disponible = d && typeof d.imagen === 'string' && /^sha256:[0-9a-f]{64}$/.test(d.imagen)
      ? { imagen: d.imagen, fecha: typeof d.fecha === 'string' ? d.fecha : null } : null;
    const s = disponible && leer(path.join(this.dir, 'solicitada.json'));
    return { disponible, solicitada: s?.fecha ?? null };
  }

  /** «Actualizar ahora»: la tarea lo verá en su siguiente pasada (5 min como mucho). */
  solicitar(quien) {
    if (!this.estado().disponible) throw Object.assign(new Error('No hay ninguna versión nueva que instalar.'), { codigo: 409 });
    const fecha = this.ahora().toISOString();
    this.#escribir('solicitada.json', { fecha, quien });
    return { solicitada: fecha };
  }
}
