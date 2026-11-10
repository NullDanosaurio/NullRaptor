// Orden de las tarjetas del Resumen: funciones puras, sin React ni red.

/** Descarta ids desconocidos y repetidos, y añade al final los que falten (misma regla que el servidor). */
export function normalizar(orden, ids) {
  const vistos = new Set();
  for (const id of Array.isArray(orden) ? orden : []) if (ids.includes(id)) vistos.add(id);
  for (const id of ids) vistos.add(id);
  return [...vistos];
}

/**
 * Mueve `id` `delta` posiciones (negativo = antes). Si se pasa `visibles`, solo cuentan esas tarjetas: las
 * ausentes se saltan. Devuelve la misma lista (misma referencia) si no hay nada que mover.
 */
export function mover(orden, id, delta, visibles = null) {
  if (!orden.includes(id) || !Number.isInteger(delta) || delta === 0) return orden;
  const candidatos = visibles ? orden.filter((x) => x === id || visibles.includes(x)) : orden;
  const destino = candidatos[candidatos.indexOf(id) + delta];
  if (destino === undefined || destino === id) return orden;
  const resto = orden.filter((x) => x !== id);
  const en = resto.indexOf(destino) + (delta > 0 ? 1 : 0);
  return [...resto.slice(0, en), id, ...resto.slice(en)];
}
