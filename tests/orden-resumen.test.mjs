// Orden de las tarjetas del Resumen (panel/src/vistas/resumen/orden.js): funciones puras.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { guardarOptimista, mover, normalizar } from '../panel/src/vistas/resumen/orden.js';
import { IDS } from '../panel/lib/diseno.mjs';

const o = ['a', 'b', 'c', 'd'];

test('mover: baja y sube una posición', () => {
  assert.deepEqual(mover(o, 'a', 1), ['b', 'a', 'c', 'd']);
  assert.deepEqual(mover(o, 'd', -1), ['a', 'b', 'd', 'c']);
  assert.deepEqual(mover(o, 'a', 2), ['b', 'c', 'a', 'd']);
});

test('mover: en los límites o con id desconocido devuelve la misma lista', () => {
  assert.equal(mover(o, 'a', -1), o);
  assert.equal(mover(o, 'd', 1), o);
  assert.equal(mover(o, 'z', 1), o);
  assert.equal(mover(o, 'b', 0), o);
  assert.equal(mover([], 'a', 1), mover([], 'a', 1));
  assert.equal(mover(['a'], 'a', 1), mover(['a'], 'a', 1));
});

test('mover: no modifica la entrada', () => {
  const copia = [...o];
  mover(o, 'b', 1);
  assert.deepEqual(o, copia);
});

test('mover: salta las tarjetas ausentes si se pasa la lista de visibles', () => {
  assert.deepEqual(mover(o, 'a', 1, ['a', 'c', 'd']), ['b', 'c', 'a', 'd']);
  assert.deepEqual(mover(o, 'd', -1, ['a', 'b', 'd']), ['a', 'd', 'b', 'c']);
  assert.equal(mover(o, 'a', -1, ['a', 'c']), o);
  assert.equal(mover(o, 'c', 1, ['a', 'c']), o);
});

test('normalizar: quita lo desconocido y repetido y añade lo que falte', () => {
  assert.deepEqual(normalizar(['c', 'x', 'c', 'a'], ['a', 'b', 'c']), ['c', 'a', 'b']);
  assert.deepEqual(normalizar(null, ['a', 'b']), ['a', 'b']);
});

test('el orden por defecto del panel coincide con IDS del servidor', () => {
  const fuente = fs.readFileSync(new URL('../panel/src/vistas/resumen/registro.jsx', import.meta.url), 'utf8');
  const lista = fuente.match(/ORDEN_POR_DEFECTO = (\[[^\]]*\])/)[1].replaceAll("'", '"');
  assert.deepEqual(JSON.parse(lista), IDS);
});

test('guardarOptimista: si falla, restaura el orden anterior y guarda el error', async () => {
  const llamadas = [];
  const fallo = new Error('falló el guardado');
  await guardarOptimista({
    orden: o,
    nuevo: ['b', 'a', 'c', 'd'],
    guardar: async () => { throw fallo; },
    setLocal: (valor) => {
      if (typeof valor === 'function') llamadas.push(valor(llamadas.at(-1) ?? null));
      else llamadas.push(valor);
    },
    setError: (error) => llamadas.push(error),
  });
  assert.deepEqual(llamadas[0], ['b', 'a', 'c', 'd']);
  assert.deepEqual(llamadas[1], o);
  assert.equal(llamadas[2], fallo);
});

test('guardarOptimista: si tiene éxito, conserva el nuevo orden y limpia el error', async () => {
  const llamadas = [];
  const nuevo = ['b', 'a', 'c', 'd'];
  await guardarOptimista({
    orden: o,
    nuevo,
    guardar: async () => {},
    setLocal: (valor) => llamadas.push(valor),
    setError: (error) => llamadas.push(error),
  });
  assert.deepEqual(llamadas, [nuevo, null]);
});
