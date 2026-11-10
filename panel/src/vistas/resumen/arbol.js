// Árbol de una vista: funciones puras, sin React ni red. Contenedor {t:'fila'|'col', peso_h, peso_v, hijos} y
// hoja {t:'w', id, tipo, peso_h, peso_v, ajustes, fuentes}. El servidor (panel/lib/arbol.mjs) es quien manda;
// aquí solo se valida lo mínimo para no pintar basura.

const esPeso = (p) => Number.isInteger(p) && p >= 1 && p <= 12;

/** Hojas en orden de lectura (profundidad primero). */
export function hojas(nodo, salida = []) {
  if (nodo?.t === 'w') salida.push(nodo);
  else if (Array.isArray(nodo?.hijos)) for (const h of nodo.hijos) hojas(h, salida);
  return salida;
}

/** Comprobación mínima: devuelve un mensaje de error o null. */
export function validarLocal(nodo, profundidad = 0) {
  if (nodo === null || typeof nodo !== 'object') return 'Nodo no válido.';
  if (profundidad > 8) return 'Árbol demasiado profundo.';
  if (!esPeso(nodo.peso_h) || !esPeso(nodo.peso_v)) return 'Peso no válido.';
  if (nodo.t === 'w') return typeof nodo.id === 'string' && typeof nodo.tipo === 'string' ? null : 'Hoja sin id o tipo.';
  if (nodo.t !== 'fila' && nodo.t !== 'col') return 'Tipo de nodo desconocido.';
  if (!Array.isArray(nodo.hijos) || nodo.hijos.length < 1 || nodo.hijos.length > 6) return 'Un contenedor lleva de 1 a 6 hijos.';
  for (const h of nodo.hijos) { const e = validarLocal(h, profundidad + 1); if (e) return e; }
  return null;
}

/** Copia del árbol sin las hojas que no cumplen `visible(hoja)` ni los contenedores que se quedan vacíos. */
export function podar(nodo, visible) {
  if (nodo.t === 'w') return visible(nodo) ? nodo : null;
  const hijos = nodo.hijos.map((h) => podar(h, visible)).filter(Boolean);
  if (!hijos.length) return null;
  return hijos.every((h, i) => h === nodo.hijos[i]) && hijos.length === nodo.hijos.length ? nodo : { ...nodo, hijos };
}

/**
 * Intercambia la hoja `id` con la hoja vecina (`delta` -1 = anterior, 1 = siguiente en orden de lectura), dejando
 * los contenedores y los pesos de cada posición donde están. Con `visibles` (lista de ids), las demás hojas se saltan. Devuelve la misma
 * referencia si no hay nada que mover.
 */
export function moverHoja(raiz, id, delta, visibles = null) {
  if (!Number.isInteger(delta) || delta === 0) return raiz;
  const todas = hojas(raiz);
  const candidatas = visibles ? todas.filter((h) => h.id === id || visibles.includes(h.id)) : todas;
  const origen = candidatas.find((h) => h.id === id);
  const destino = origen && candidatas[candidatas.indexOf(origen) + delta];
  if (!destino) return raiz;
  const cambiar = (n) => {
    if (n.t === 'w') {
      // Cada posición conserva sus pesos; se intercambia el contenido (id, tipo, ajustes, fuentes).
      const otro = n === origen ? destino : n === destino ? origen : null;
      return otro ? { ...otro, peso_h: n.peso_h, peso_v: n.peso_v } : n;
    }
    return { ...n, hijos: n.hijos.map(cambiar) };
  };
  return cambiar(raiz);
}
