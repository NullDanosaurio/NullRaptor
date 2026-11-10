// Árbol de una vista: nodos contenedor {t:'fila'|'col', peso_h, peso_v, hijos} y hojas
// {t:'w', id:'w_<hex8>', tipo, peso_h, peso_v, ajustes, fuentes}. Valida y normaliza entrada no fiable:
// nunca lanza, devuelve { raiz } o { error }. Sin recursión sin tope (la profundidad se comprueba antes de bajar).
import crypto from 'node:crypto';
import { TIPOS, esTipo } from './tipos-widget.mjs';

export const TOPES = { vistas: 20, profundidad: 4, nodos: 60, hojas: 30, hijosMin: 1, hijosMax: 6, bytes: 64 * 1024, pesoMin: 1, pesoMax: 12 };
export const ID_WIDGET = /^w_[0-9a-f]{8}$/;

const CLAVES_CONT = ['t', 'peso_h', 'peso_v', 'hijos'];
const CLAVES_HOJA = ['t', 'id', 'tipo', 'peso_h', 'peso_v', 'ajustes', 'fuentes'];
const objetoPlano = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const falla = (error) => { throw Object.assign(new Error(error), { validacion: true }); };

function peso(valor, defecto, donde) {
  if (valor === undefined) return defecto;
  if (!Number.isInteger(valor) || valor < TOPES.pesoMin || valor > TOPES.pesoMax) falla(`${donde}: el peso debe ser un entero de ${TOPES.pesoMin} a ${TOPES.pesoMax}.`);
  return valor;
}

function claves(nodo, permitidas, donde) {
  for (const k of Object.keys(nodo)) if (!permitidas.includes(k)) falla(`${donde}: clave no permitida «${k.slice(0, 30)}».`);
  if (Object.hasOwn(nodo, '__proto__')) falla(`${donde}: clave no permitida.`);
}

/** Pila explícita: profundidad y nodos se comprueban al meter cada hijo, antes de bajar. */
function normalizarArbol(raiz, ids) {
  let nodos = 0;
  let hojas = 0;
  const salida = {};
  const pila = [{ nodo: raiz, destino: salida, nivel: 1, ruta: 'raíz' }];
  while (pila.length) {
    const { nodo, destino, nivel, ruta } = pila.pop();
    if (nivel > TOPES.profundidad) falla(`${ruta}: supera la profundidad máxima (${TOPES.profundidad}).`);
    if (++nodos > TOPES.nodos) falla(`Demasiados nodos (máximo ${TOPES.nodos}).`);
    if (!objetoPlano(nodo)) falla(`${ruta}: no es un nodo.`);
    if (nodo.t === 'w') {
      claves(nodo, CLAVES_HOJA, ruta);
      if (++hojas > TOPES.hojas) falla(`Demasiados widgets en la vista (máximo ${TOPES.hojas}).`);
      if (!esTipo(nodo.tipo)) falla(`${ruta}: tipo de widget desconocido.`);
      let id = nodo.id;
      if (id === undefined) id = `w_${crypto.randomBytes(4).toString('hex')}`;
      if (typeof id !== 'string' || !ID_WIDGET.test(id)) falla(`${ruta}: id de widget no válido (w_ y 8 hex).`);
      if (ids.has(id)) falla(`${ruta}: id de widget repetido.`);
      ids.add(id);
      const tam = TIPOS[nodo.tipo].tamano;
      if (nodo.ajustes !== undefined && !(objetoPlano(nodo.ajustes) && Object.keys(nodo.ajustes).length === 0)) falla(`${ruta}: los ajustes deben ser un objeto vacío.`);
      if (nodo.fuentes !== undefined && !(Array.isArray(nodo.fuentes) && nodo.fuentes.length === 0)) falla(`${ruta}: las fuentes deben ser una lista vacía.`);
      Object.assign(destino, { t: 'w', id, tipo: nodo.tipo, peso_h: peso(nodo.peso_h, tam.peso_h, ruta), peso_v: peso(nodo.peso_v, tam.peso_v, ruta), ajustes: {}, fuentes: [] });
    } else if (nodo.t === 'fila' || nodo.t === 'col') {
      claves(nodo, CLAVES_CONT, ruta);
      if (!Array.isArray(nodo.hijos) || nodo.hijos.length < TOPES.hijosMin || nodo.hijos.length > TOPES.hijosMax) falla(`${ruta}: debe tener de ${TOPES.hijosMin} a ${TOPES.hijosMax} hijos.`);
      Object.assign(destino, { t: nodo.t, peso_h: peso(nodo.peso_h, 12, ruta), peso_v: peso(nodo.peso_v, 12, ruta), hijos: nodo.hijos.map(() => ({})) });
      for (let i = nodo.hijos.length - 1; i >= 0; i--) pila.push({ nodo: nodo.hijos[i], destino: destino.hijos[i], nivel: nivel + 1, ruta: `${ruta}.${nodo.t}[${i}]` });
    } else falla(`${ruta}: tipo de nodo desconocido.`);
  }
  return salida;
}

/** Valida y normaliza un árbol. `ids` (Set) recoge los ids de hoja para detectar repetidos entre llamadas. */
export function validarArbol(raiz, ids = new Set()) {
  try {
    return { raiz: normalizarArbol(raiz, ids) };
  } catch (e) {
    return { error: e.validacion ? e.message : 'El árbol no es válido.' };
  }
}

/** Hojas en orden de lectura (recorrido iterativo). */
export function hojasDe(raiz) {
  const fuera = [];
  const pila = [raiz];
  while (pila.length) {
    const n = pila.pop();
    if (n.t === 'w') fuera.push(n); else for (let i = n.hijos.length - 1; i >= 0; i--) pila.push(n.hijos[i]);
  }
  return fuera;
}
