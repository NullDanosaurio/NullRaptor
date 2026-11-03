// Física del grafo de la bóveda (panel/src/grafo.js): se para sola, sin NaN, y las notas enlazadas quedan cerca.
import test from 'node:test';
import assert from 'node:assert/strict';
import { asignarColores, crearSimulacion, nodoEn, paso, radioDe } from '../panel/src/grafo.js';

test('la simulación se estabiliza y acerca lo enlazado', () => {
  const nodos = Array.from({ length: 40 }, (_, i) => ({ id: `n${i}`, nombre: `n${i}`, carpeta: i % 2 ? 'A' : 'B' }));
  // Dos grupos de 20 enlazados en cadena, sin enlaces entre ellos.
  const aristas = [];
  for (let i = 1; i < 20; i++) { aristas.push({ origen: `n${i - 1}`, destino: `n${i}` }); aristas.push({ origen: `n${i + 19}`, destino: `n${i + 20}` }); }
  aristas.push({ origen: 'n0', destino: 'no-existe' });
  const s = crearSimulacion(nodos, aristas);
  assert.equal(s.enlaces.length, 38);
  let pasos = 0;
  while (paso(s)) pasos += 1;
  assert.ok(pasos > 50 && pasos < 1000, `pasos: ${pasos}`);
  assert.ok(s.nodos.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  const d = (a, b) => Math.hypot(s.nodos[a].x - s.nodos[b].x, s.nodos[a].y - s.nodos[b].y);
  const enlazados = s.enlaces.reduce((t, [a, b]) => t + d(a, b), 0) / s.enlaces.length;
  let lejos = 0; let n = 0;
  for (let i = 0; i < 20; i++) for (let j = 20; j < 40; j += 3) { lejos += d(i, j); n += 1; }
  assert.ok(enlazados < lejos / n, `enlazados ${enlazados.toFixed(1)} vs resto ${(lejos / n).toFixed(1)}`);
  assert.equal(nodoEn(s, s.nodos[5].x, s.nodos[5].y, radioDe), 5);
  assert.equal(nodoEn(s, 1e6, 1e6, radioDe), -1);
});

test('colores: uno por carpeta, estables y distintos; la raíz, blanca', () => {
  const c = asignarColores([{ carpeta: 'Proyectos' }, { carpeta: 'Diario' }, { carpeta: '' }, { carpeta: 'x', fantasma: true }]);
  assert.equal(c.get(''), '#e8ece9');
  assert.notEqual(c.get('Diario'), c.get('Proyectos'));
  assert.equal(c.has('x'), false);
});
