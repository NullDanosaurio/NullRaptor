// Árbol de vistas del Resumen (panel/src/vistas/resumen/arbol.js): funciones puras.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hojas, moverHoja, podar, validarLocal } from '../panel/src/vistas/resumen/arbol.js';
import { validarVistas } from '../panel/lib/vistas.mjs';

const w = (id) => ({ t: 'w', id, tipo: id, peso_h: 6, peso_v: 1, ajustes: {}, fuentes: [] });
const fila = (...hijos) => ({ t: 'fila', peso_h: 12, peso_v: 1, hijos });
const raiz = { t: 'col', peso_h: 12, peso_v: 1, hijos: [fila(w('a')), fila(w('b'), w('c')), fila(w('d'))] };
const ids = (r) => hojas(r).map((h) => h.id);

test('hojas: orden de lectura', () => assert.deepEqual(ids(raiz), ['a', 'b', 'c', 'd']));

test('moverHoja: intercambia con la vecina y conserva la estructura', () => {
  const r = moverHoja(raiz, 'c', 1);
  assert.deepEqual(ids(r), ['a', 'b', 'd', 'c']);
  assert.deepEqual(r.hijos.map((f) => f.hijos.length), [1, 2, 1]);
  assert.deepEqual(ids(raiz), ['a', 'b', 'c', 'd'], 'no muta el original');
  assert.deepEqual(ids(moverHoja(raiz, 'b', -1)), ['b', 'a', 'c', 'd']);
});

test('moverHoja: límites, id desconocido o delta 0 devuelven la misma referencia', () => {
  assert.equal(moverHoja(raiz, 'a', -1), raiz);
  assert.equal(moverHoja(raiz, 'd', 1), raiz);
  assert.equal(moverHoja(raiz, 'z', 1), raiz);
  assert.equal(moverHoja(raiz, 'b', 0), raiz);
  const sola = w('a');
  assert.equal(moverHoja(sola, 'a', 1), sola);
});

test('moverHoja: con visibles se saltan las ocultas', () => {
  assert.deepEqual(ids(moverHoja(raiz, 'a', 1, ['a', 'c', 'd'])), ['c', 'b', 'a', 'd']);
  assert.equal(moverHoja(raiz, 'd', 1, ['a', 'd']), raiz);
});

test('podar: quita hojas ocultas y contenedores vacíos; sin cambios conserva la referencia', () => {
  const p = podar(raiz, (h) => h.id !== 'a' && h.id !== 'c');
  assert.deepEqual(ids(p), ['b', 'd']);
  assert.equal(p.hijos.length, 2);
  assert.equal(podar(raiz, () => true), raiz);
  assert.equal(podar(raiz, () => false), null);
});

test('validarLocal: acepta el árbol y rechaza pesos, hijos y tipos malos', () => {
  assert.equal(validarLocal(raiz), null);
  assert.ok(validarLocal({ ...raiz, peso_h: 13 }));
  assert.ok(validarLocal({ ...raiz, hijos: [] }));
  assert.ok(validarLocal({ ...raiz, t: 'otro' }));
  assert.ok(validarLocal({ ...raiz, hijos: [{ ...w('a'), id: 3 }] }));
  assert.ok(validarLocal(null));
});

test('el árbol que sirve el servidor pasa la validación local y mover lo sigue validando en el servidor', () => {
  const { datos } = validarVistas({ version: 2, vistas: [{ id: 'v_resumen', nombre: 'Resumen', raiz: { t: 'col', hijos: [{ t: 'fila', hijos: [{ t: 'w', tipo: 'cifras' }] }, { t: 'fila', hijos: [{ t: 'w', tipo: 'gasto' }, { t: 'w', tipo: 'chats' }] }] } }] });
  const r = datos.vistas[0].raiz;
  assert.equal(validarLocal(r), null);
  const movido = moverHoja(r, hojas(r)[1].id, 1);
  assert.equal(validarVistas({ version: 2, inicio: datos.inicio, vistas: [{ ...datos.vistas[0], raiz: movido }] }).error, undefined);
});

test('moverHoja: cada posición conserva sus pesos y el árbol sigue siendo válido', () => {
  const h = (tipo, peso_h) => ({ t: 'w', tipo, peso_h });
  const { datos } = validarVistas({ version: 2, vistas: [{ id: 'v_resumen', nombre: 'Resumen', raiz: { t: 'fila', hijos: [h('cifras', 8), h('gasto', 4), h('chats', 4)] } }] });
  const r = datos.vistas[0].raiz;
  const [a, b, c] = hojas(r).map((x) => x.id);
  const pesos = (n) => n.hijos.map((x) => x.peso_h);
  const m = moverHoja(r, a, 1);
  assert.deepEqual(ids(m), [b, a, c]);
  assert.deepEqual(pesos(m), [8, 4, 4], 'ancha↔estrecha: los anchos por posición no cambian');
  assert.deepEqual(pesos(moverHoja(r, b, 1)), [8, 4, 4], 'mismo peso sigue igual');
  assert.equal(moverHoja(r, c, 1), r, 'sin vecina, misma referencia');
  assert.equal(validarVistas({ version: 2, inicio: datos.inicio, vistas: [{ ...datos.vistas[0], raiz: m }] }).error, undefined);
});
