// Paquetes apt persistentes (scripts/paquetes.mjs): la lista del volumen y lo que se manda a apt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ejecutarOrden, guardarLista, leerLista, validar } from '../scripts/paquetes.mjs';

const dir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'paquetes-'));
const falso = (fallan = []) => {
  const llamadas = [];
  return { llamadas, ejecutar: (orden, args) => { llamadas.push([orden, ...args]); return args.some((a) => fallan.includes(a)) ? 100 : 0; } };
};

test('validar: solo nombres de paquete; nada de opciones ni órdenes', () => {
  assert.deepEqual(validar(['libgl1', 'g++', 'python3.12-dev', 'libc6:i386']), ['libgl1', 'g++', 'python3.12-dev', 'libc6:i386']);
  for (const malo of ['-y', '--allow-unauthenticated', 'a b', 'x;rm', 'Mayus', '']) assert.throws(() => validar([malo]));
  assert.throws(() => validar([]));
});

test('instalar: apt con sudo y, solo si sale bien, se apunta en la lista (sin repetir)', () => {
  const d = dir();
  const f = falso();
  assert.equal(ejecutarOrden('instalar', ['blender', 'libgl1'], { dir: d, ejecutar: f.ejecutar }).codigo, 0);
  assert.deepEqual(f.llamadas.at(-1), ['sudo', 'apt-get', 'install', '-y', '--no-install-recommends', 'blender', 'libgl1']);
  ejecutarOrden('instalar', ['libgl1'], { dir: d, ejecutar: f.ejecutar });
  assert.deepEqual(leerLista(d), ['blender', 'libgl1']);
  const mal = falso(['roto']);
  assert.equal(ejecutarOrden('instalar', ['roto'], { dir: d, ejecutar: mal.ejecutar }).codigo, 1);
  assert.deepEqual(leerLista(d), ['blender', 'libgl1']);
});

test('restaurar: instala uno a uno solo los que faltan; quitar los saca de la lista', () => {
  const d = dir();
  guardarLista(['a', 'b', 'c'], d);
  const f = falso(['c']);
  const r = ejecutarOrden('restaurar', [], { dir: d, ejecutar: f.ejecutar, comprobar: (p) => p === 'a' });
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /c/);
  assert.deepEqual(f.llamadas.filter((l) => l.includes('install')).map((l) => l.at(-1)), ['b', 'c']);
  assert.equal(ejecutarOrden('restaurar', [], { dir: d, ejecutar: f.ejecutar, comprobar: () => true }).salida, 'Nada que restaurar.');
  ejecutarOrden('quitar', ['b'], { dir: d, ejecutar: f.ejecutar });
  assert.deepEqual(leerLista(d), ['a', 'c']);
  assert.throws(() => ejecutarOrden('otra', []), /Uso/);
});
