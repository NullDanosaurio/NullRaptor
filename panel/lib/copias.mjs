// Copia de seguridad diaria del volumen (scripts/copia.mjs): el panel revisa cada hora si toca y la hace en segundo
// plano. Sin clave pública (Daniel aún no la ha creado) no hace nada y el Resumen lo dice.
import fs from 'node:fs';
import path from 'node:path';
import { BASE, ejecutarCopia, estado, extraPorDefecto, proyectosSinSubir } from '../../scripts/copia.mjs';

export class Copias {
  constructor({ base = BASE, extra = extraPorDefecto(), cadaHoras = 24, conservar = 7, ahora = () => new Date() } = {}) {
    Object.assign(this, { base, extra, cadaHoras, conservar, ahora });
    this.destino = path.join(base, 'copias');
    this.corriendo = false;
    this.error = null;
    this.sinSubir = [];
  }

  /** Lo que enseña el Resumen. `aviso` es null si todo está bien. */
  estado() {
    const clave = fs.existsSync(path.join(this.destino, 'clave-publica.pem'));
    const e = estado(this.destino, this.ahora());
    const aviso = !clave ? 'sin-clave' : this.error ? 'error' : e.horas === null || e.horas > this.cadaHoras * 1.5 ? 'atrasada' : null;
    return { clave, copias: e.copias, fecha: e.fecha ?? null, horas: e.horas, corriendo: this.corriendo, error: this.error, extra: this.extra, sinSubir: this.sinSubir, aviso };
  }

  /** Vuelve a mirar qué proyectos tienen commits sin subir (tras un reinicio no hay copia reciente que lo calcule). */
  refrescarSinSubir() {
    try { this.sinSubir = proyectosSinSubir(path.join(this.base, 'trabajo')); } catch { /* se queda con lo anterior */ }
  }

  /** Hace la copia si hay clave y toca (la primera, o pasadas `cadaHoras`). Nunca lanza. */
  async revisar() {
    this.refrescarSinSubir();
    const e = this.estado();
    if (this.corriendo || !e.clave || (e.horas !== null && e.horas < this.cadaHoras)) return false;
    this.corriendo = true;
    try {
      const r = await ejecutarCopia({ base: this.base, conservar: this.conservar, extra: this.extra, ahora: this.ahora() });
      this.sinSubir = r.sinSubir;
      this.error = null;
    } catch (err) { this.error = String(err?.message ?? err).slice(0, 300); console.warn(`[panel] copia: ${this.error}`); }
    this.corriendo = false;
    return true;
  }

  iniciar() {
    const hora = setInterval(() => this.revisar(), 3_600_000);
    const primera = setTimeout(() => this.revisar(), 60_000); // deja arrancar el panel antes de comprimir
    const pronto = setTimeout(() => this.refrescarSinSubir(), 5_000);
    hora.unref?.(); primera.unref?.(); pronto.unref?.();
    return () => { clearInterval(hora); clearTimeout(primera); clearTimeout(pronto); };
  }
}
