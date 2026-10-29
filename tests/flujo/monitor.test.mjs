// Pruebas del monitor del flujo (funciones puras).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FASES, duracion, fasesDeIntento } from '../../flujo/monitor.mjs';

test('duración legible', () => {
  assert.equal(duracion(4_400), '4s');
  assert.equal(duracion(95_000), '1m35s');
  assert.equal(duracion(3_725_000), '1h02m');
  assert.equal(duracion(-1), '');
  assert.equal(duracion(Number.NaN), '');
});

test('fases: hechas según registros, fallos según el resumen', () => {
  const archivos = ['intento-2-implementador.log', 'intento-2-typecheck.log', 'intento-2-pruebas.log', 'intento-1-build.log'];
  const fases = fasesDeIntento(archivos, 2, { comprobaciones: { typecheck: true, pruebas: false } });
  assert.deepEqual(fases.map((f) => f.fase), FASES);
  assert.deepEqual(fases.map((f) => f.estado), ['ok', 'ok', 'fallo', 'pendiente', 'pendiente', 'pendiente']);
});

test('fases: revisión rechazada se marca como fallo', () => {
  const archivos = FASES.map((f) => `intento-1-${f}.log`);
  const fases = fasesDeIntento(archivos, 1, { comprobaciones: {}, revision: { approved: false } });
  assert.equal(fases.at(-1)?.estado, 'fallo');
  assert.ok(fases.slice(0, -1).every((f) => f.estado === 'ok'));
});
