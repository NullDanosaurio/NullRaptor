// Diseño del Resumen (panel/lib/diseno.mjs): orden de los widgets, normalizado y guardado atómico.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Diseno, IDS } from '../panel/lib/diseno.mjs';

const temporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'diseno-'));

test('leer: ausente, corrupto o de tipo erróneo dan el orden por defecto sin escribir', () => {
  const trabajo = temporal();
  const d = new Diseno({ trabajo });
  assert.deepEqual(d.leer(), { orden: IDS });
  assert.equal(fs.existsSync(path.join(trabajo, 'panel')), false);
  fs.mkdirSync(path.join(trabajo, 'panel'));
  for (const texto of ['{no es json', '"hola"', '{"orden":"cifras"}', 'null', '{"orden":{"a":1}}']) {
    fs.writeFileSync(d.archivo, texto);
    assert.deepEqual(d.leer(), { orden: IDS }, texto);
    assert.equal(fs.readFileSync(d.archivo, 'utf8'), texto);
  }
});

test('normalizar: descarta desconocidos y repetidos y añade los que faltan al final', () => {
  const d = new Diseno({ trabajo: temporal() });
  assert.deepEqual(d.normalizar(['chats', 'inventado', 'gasto', 'chats', 7, 'avisos']), ['chats', 'gasto', 'avisos', ...IDS.filter((i) => !['chats', 'gasto', 'avisos'].includes(i))]);
  assert.deepEqual(d.normalizar([]), IDS);
  assert.deepEqual(d.normalizar(null), IDS);
});

test('guardar: devuelve el normalizado, se relee idéntico y no deja .tmp', () => {
  const trabajo = temporal();
  const d = new Diseno({ trabajo });
  const r = d.guardar(['mcp', 'x', 'mcp', 'cifras']);
  assert.equal(r.length, IDS.length);
  assert.deepEqual(r.slice(0, 2), ['mcp', 'cifras']);
  assert.deepEqual(d.leer(), { orden: r });
  assert.deepEqual(new Diseno({ trabajo }).leer(), { orden: r });
  assert.deepEqual(fs.readdirSync(d.dir), ['diseno.json']);
});
