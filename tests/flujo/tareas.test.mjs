// Orden de tareas del flujo (movido desde la tienda el 29/10/2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordenar } from '../../flujo/lib/tareas.mjs';

const t = (id, dependencias = []) => ({ id, dependencias });

test('ordena tareas respetando dependencias', () => {
  const orden = ordenar([t('C', ['B']), t('A'), t('B', ['A'])]).map((x) => x.id);
  assert.deepEqual(orden, ['A', 'B', 'C']);
});

test('detecta dependencias circulares y desconocidas', () => {
  assert.throws(() => ordenar([t('A', ['B']), t('B', ['A'])]), /circular/);
  assert.throws(() => ordenar([t('A', ['Z'])]), /no existe/);
});
