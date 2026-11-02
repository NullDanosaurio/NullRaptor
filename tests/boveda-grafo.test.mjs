// Grafo de la bóveda (panel/lib/boveda.mjs): nodos, conexiones y notas fantasma, resueltos como en Obsidian.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { grafo } from '../panel/lib/boveda.mjs';

function boveda(archivos) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'grafo-'));
  for (const [ruta, texto] of Object.entries(archivos)) {
    fs.mkdirSync(path.dirname(path.join(raiz, ruta)), { recursive: true });
    fs.writeFileSync(path.join(raiz, ruta), texto);
  }
  return raiz;
}

test('grafo: enlaces por nombre o por ruta, sin dirección ni repetidos; fantasmas para lo que no existe', () => {
  const raiz = boveda({
    '00-Inicio.md': 'Ver [[Nullraptor]] y [[Proyectos/Modelos3D|modelos]] y [[Pendiente]].',
    'Proyectos/Nullraptor.md': '---\ntipo: proyecto\n---\n[[00-Inicio]] [[modelos3d#Estado]] [[Nullraptor]] [[Pendiente]]',
    'Proyectos/Modelos3D.md': 'Vuelve a [[Nullraptor]].',
    '.obsidian/oculta.md': '[[00-Inicio]]',
    'Sola.md': 'Sin enlaces.',
  });
  const g = grafo(raiz);
  const ids = g.nodos.map((n) => n.id).sort();
  assert.deepEqual(ids, ['00-Inicio.md', 'Proyectos/Modelos3D.md', 'Proyectos/Nullraptor.md', 'Sola.md', 'fantasma:pendiente']);
  assert.equal(g.nodos.find((n) => n.id === 'Proyectos/Nullraptor.md').carpeta, 'Proyectos');
  assert.equal(g.nodos.find((n) => n.id === 'fantasma:pendiente').fantasma, true);
  const pares = g.aristas.map((a) => [a.origen, a.destino].sort().join(' — ')).sort();
  assert.deepEqual(pares, [
    '00-Inicio.md — Proyectos/Modelos3D.md',
    '00-Inicio.md — Proyectos/Nullraptor.md',
    '00-Inicio.md — fantasma:pendiente',
    'Proyectos/Modelos3D.md — Proyectos/Nullraptor.md',
    'Proyectos/Nullraptor.md — fantasma:pendiente',
  ]);
});
