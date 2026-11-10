// Diseño del Resumen (panel/lib/diseno.mjs): orden de los widgets, normalizado y guardado atómico.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { crearAcceso } from '../panel/lib/acceso.mjs';
import { crearServidor } from '../panel/servidor.mjs';
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

function pedir(port, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject);
    if (cuerpo !== undefined) r.write(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    r.end();
  });
}

test('ruta /api/diseno: sesión, cabecera, validación, tamaño, guardado y métodos', async (t) => {
  const trabajo = temporal();
  const codigo = 'ABCD-EFGH-JKLM';
  const servidor = crearServidor({ trabajo, memoria: null, acceso: crearAcceso(codigo) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const cookie = crearAcceso(codigo).cookie.split(';')[0];
  const local = { host: 'localhost:4321', 'x-nullraptor': '1', cookie };

  assert.equal((await pedir(port, 'GET', '/api/diseno', { cab: { host: '192.168.1.20:4321' } })).estado, 401);
  assert.equal((await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: ['gasto'] }, cab: { host: 'localhost:4321', cookie } })).estado, 403);
  assert.equal((await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: ['inventado'] }, cab: local })).estado, 400);
  assert.equal((await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: ['gasto', 'gasto'] }, cab: local })).estado, 400);
  assert.equal((await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: 'gasto' }, cab: local })).estado, 400);
  assert.equal((await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: [...IDS, 'cifras'] }, cab: local })).estado, 400);
  const grande = await pedir(port, 'PUT', '/api/diseno', { cuerpo: JSON.stringify({ orden: [], relleno: 'x'.repeat(70 * 1024) }), cab: local }).catch((e) => ({ estado: e.code }));
  assert.ok(grande.estado === 413 || grande.estado === 'ECONNRESET', String(grande.estado));

  const put = await pedir(port, 'PUT', '/api/diseno', { cuerpo: { orden: ['chats', 'gasto'] }, cab: local });
  assert.equal(put.estado, 200);
  assert.deepEqual(put.datos.orden.slice(0, 2), ['chats', 'gasto']);
  assert.equal(put.datos.orden.length, IDS.length);
  assert.deepEqual((await pedir(port, 'GET', '/api/diseno', { cab: local })).datos, put.datos);
  assert.equal((await pedir(port, 'DELETE', '/api/diseno', { cab: local })).estado, 405);
});
