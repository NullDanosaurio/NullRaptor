// Vistas del panel: <trabajo>/panel/vistas.json {version:2, inicio, vistas:[{id, nombre, raiz}]}.
// Si no existe (o no sirve), se construye la vista v_resumen desde el orden de diseno.json, sin escribir nada.
import fs from 'node:fs';
import path from 'node:path';
import { Diseno } from './diseno.mjs';
import { TOPES, validarArbol } from './arbol.mjs';
import { TIPOS } from './tipos-widget.mjs';

export const VERSION = 2;
export const VISTAS_E1 = 1; // en E1 hay una sola vista
const ID_VISTA = /^v_[a-z0-9_]{1,40}$/;
const ancha = (tipo) => TIPOS[tipo].tamano.peso_h === 12;

const hoja = (tipo) => ({ t: 'w', tipo });

/** Árbol del Resumen: filas de una tarjeta ancha o de hasta dos estrechas; más de 6 filas se agrupan (profundidad 4). */
export function raizDesdeOrden(orden) {
  const filas = [];
  let par = [];
  const cerrar = () => { if (par.length) filas.push({ t: 'fila', hijos: par }); par = []; };
  for (const tipo of orden) {
    if (ancha(tipo)) { cerrar(); filas.push({ t: 'fila', hijos: [hoja(tipo)] }); continue; }
    par.push(hoja(tipo));
    if (par.length === 2) cerrar();
  }
  cerrar();
  if (filas.length <= TOPES.hijosMax) return { t: 'col', hijos: filas };
  const grupos = [];
  for (let i = 0; i < filas.length; i += 5) grupos.push({ t: 'col', hijos: filas.slice(i, i + 5) });
  return { t: 'col', hijos: grupos };
}

/** Valida y normaliza el documento completo. Nunca lanza: { datos } o { error }. */
export function validarVistas(doc) {
  try {
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return { error: 'Las vistas no son un objeto.' };
    if (Object.hasOwn(doc, '__proto__') || Object.keys(doc).some((k) => !['version', 'inicio', 'vistas'].includes(k))) return { error: 'Claves no permitidas en las vistas.' };
    if (doc.version !== VERSION) return { error: `La versión debe ser ${VERSION}.` };
    if (Buffer.byteLength(JSON.stringify(doc)) > TOPES.bytes) return { error: 'Las vistas superan el tamaño máximo (64 KB).' };
    const { vistas } = doc;
    if (!Array.isArray(vistas) || vistas.length < 1) return { error: 'Falta al menos una vista.' };
    if (vistas.length > TOPES.vistas) return { error: `Demasiadas vistas (máximo ${TOPES.vistas}).` };
    if (vistas.length > VISTAS_E1) return { error: `Por ahora solo se admite ${VISTAS_E1} vista.` };
    const ids = new Set();
    const salida = [];
    for (const v of vistas) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) return { error: 'Una vista no es un objeto.' };
      if (Object.hasOwn(v, '__proto__') || Object.keys(v).some((k) => !['id', 'nombre', 'raiz'].includes(k))) return { error: 'Claves no permitidas en una vista.' };
      if (typeof v.id !== 'string' || !ID_VISTA.test(v.id) || ids.has(v.id)) return { error: 'Id de vista no válido o repetido.' };
      ids.add(v.id);
      const nombre = typeof v.nombre === 'string' ? v.nombre.trim() : '';
      if (!nombre || nombre.length > 60) return { error: 'El nombre de la vista debe tener de 1 a 60 caracteres.' };
      const r = validarArbol(v.raiz);
      if (r.error) return { error: r.error };
      salida.push({ id: v.id, nombre, raiz: r.raiz });
    }
    const inicio = doc.inicio ?? salida[0].id;
    if (typeof inicio !== 'string' || !ids.has(inicio)) return { error: 'La vista de inicio no existe.' };
    const datos = { version: VERSION, inicio, vistas: salida };
    if (Buffer.byteLength(JSON.stringify(datos)) > TOPES.bytes) return { error: 'Las vistas superan el tamaño máximo (64 KB).' };
    return { datos };
  } catch {
    return { error: 'Las vistas no son válidas.' };
  }
}

export class Vistas {
  constructor({ trabajo }) {
    this.diseno = new Diseno({ trabajo });
    this.dir = this.diseno.dir;
    this.archivo = path.join(this.dir, 'vistas.json');
  }

  /** Vista migrada desde diseno.json (solo lectura). */
  migrada() {
    const { datos } = validarVistas({ version: VERSION, inicio: 'v_resumen', vistas: [{ id: 'v_resumen', nombre: 'Resumen', raiz: raizDesdeOrden(this.diseno.leer().orden) }] });
    return datos;
  }

  /** Nunca lanza ni escribe: archivo ausente o no válido → migración. */
  leer() {
    try {
      const r = validarVistas(JSON.parse(fs.readFileSync(this.archivo, 'utf8')));
      if (r.datos) return r.datos;
    } catch { /* migración */ }
    return this.migrada();
  }

  /** Valida, normaliza y guarda de forma atómica. Devuelve { datos } o { error }; lanza solo si falla el disco. */
  guardar(doc) {
    const r = validarVistas(doc);
    if (r.error) return r;
    fs.mkdirSync(this.dir, { recursive: true });
    const temporal = `${this.archivo}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporal, `${JSON.stringify(r.datos)}\n`);
      fs.renameSync(temporal, this.archivo);
    } catch (error) {
      fs.rmSync(temporal, { force: true });
      throw error;
    }
    return r;
  }
}
