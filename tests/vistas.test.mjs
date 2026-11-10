// Vistas (panel/lib/arbol.mjs, tipos-widget.mjs, vistas.mjs y ruta /api/vistas).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { crearAcceso } from '../panel/lib/acceso.mjs';
import { crearServidor } from '../panel/servidor.mjs';
import { IDS } from '../panel/lib/diseno.mjs';
import { TIPOS } from '../panel/lib/tipos-widget.mjs';
import { validarArbol, hojasDe, TOPES } from '../panel/lib/arbol.mjs';
import { Vistas, validarVistas } from '../panel/lib/vistas.mjs';

const temporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vistas-'));
const w = (tipo = 'gasto', extra = {}) => ({ t: 'w', tipo, ...extra });
const fila = (...hijos) => ({ t: 'fila', hijos });
const col = (...hijos) => ({ t: 'col', hijos });
const anidar = (n) => { let x = w(); for (let i = 1; i < n; i++) x = col(x); return x; };

test('tipos: los 10 de diseno.mjs, JSON puro con ajustes y permisos vacíos', () => {
  assert.deepEqual(Object.keys(TIPOS), IDS);
  assert.deepEqual(JSON.parse(JSON.stringify(TIPOS)), TIPOS);
  for (const t of Object.values(TIPOS)) {
    assert.deepEqual(t.ajustes, {});
    assert.deepEqual(t.permisos, []);
    assert.ok(t.tamano.peso_h >= 1 && t.tamano.peso_h <= 12);
  }
});

test('árbol válido: se normaliza con pesos por defecto, ids generados y hojas en orden', () => {
  const r = validarArbol(col(fila(w('cifras'), w('gasto', { id: 'w_0123abcd', peso_h: 3 })), w('chats')));
  assert.equal(r.error, undefined);
  const hojas = hojasDe(r.raiz);
  assert.deepEqual(hojas.map((h) => h.tipo), ['cifras', 'gasto', 'chats']);
  assert.match(hojas[0].id, /^w_[0-9a-f]{8}$/);
  assert.equal(hojas[1].id, 'w_0123abcd');
  assert.equal(hojas[1].peso_h, 3);
  assert.equal(hojas[0].peso_h, 12);
  assert.deepEqual(hojas[0].ajustes, {});
  assert.deepEqual(hojas[0].fuentes, []);
  assert.equal(validarArbol(w()).raiz.t, 'w');
});

test('árbol: cada tope y regla se rechazan con error claro', () => {
  const err = (x) => { const r = validarArbol(x); assert.ok(r.error, JSON.stringify(x).slice(0, 80)); return r.error; };
  assert.equal(validarArbol(anidar(TOPES.profundidad)).error, undefined);
  assert.match(err(anidar(TOPES.profundidad + 1)), /profundidad/);
  assert.match(err(col()), /hijos/);
  assert.equal(validarArbol(col(...Array(6).fill(w()))).error, undefined);
  assert.match(err(col(...Array(7).fill(w()))), /hijos/);
  const grupo = () => col(...Array(6).fill(0).map(() => fila(w(), w(), w(), w(), w(), w()))); // 6x6 = 36 hojas
  assert.match(err(col(grupo())), /widgets|nodos/);
  const nodos = col(...Array(6).fill(0).map(() => col(...Array(6).fill(0).map(() => col(w(), w(), w()))))); // >60 nodos
  assert.match(err(nodos), /nodos|widgets/);
  assert.match(err(w('inventado')), /tipo/);
  assert.match(err(w('gasto', { id: 'w_xyz' })), /id/);
  assert.match(err(col(w('gasto', { id: 'w_0123abcd' }), w('chats', { id: 'w_0123abcd' }))), /repetido/);
  for (const p of [0, 13, 1.5, '6', null, NaN]) assert.match(err(w('gasto', { peso_h: p })), /peso/, String(p));
  assert.match(err(w('gasto', { ajustes: { a: 1 } })), /ajustes/);
  assert.match(err(w('gasto', { fuentes: ['x'] })), /fuentes/);
  assert.match(err({ t: 'w', tipo: 'gasto', extra: 1 }), /clave/);
  assert.match(err({ t: 'otro' }), /desconocido/);
  assert.match(err(w('enlace')), /tipo/);
});

test('árbol: entrada hostil nunca lanza (proto, tipos erróneos, profundidad enorme)', () => {
  const hostiles = [null, undefined, 7, 'x', [], [1], true, JSON.parse('{"__proto__":{"t":"w"},"t":"w","tipo":"gasto"}'),
    JSON.parse('{"t":"col","hijos":[{"t":"w","tipo":"gasto","__proto__":{}}]}'), JSON.parse('{"t":"w","tipo":"__proto__"}'),
    JSON.parse('{"t":"w","tipo":"constructor"}'), Object.create({ t: 'w', tipo: 'gasto' }), { t: 'col', hijos: 'x' }, { t: 'col', hijos: { length: 2 } }];
  for (const h of hostiles) assert.doesNotThrow(() => validarArbol(h));
  for (const h of hostiles) assert.ok(validarArbol(h).error, String(JSON.stringify(h)));
  let hondo = '{"t":"w","tipo":"gasto"}';
  for (let i = 0; i < 5000; i++) hondo = `{"t":"col","hijos":[${hondo}]}`;
  const r = validarArbol(JSON.parse(hondo));
  assert.match(r.error, /profundidad/);
  assert.equal(Object.getPrototypeOf(validarArbol(w()).raiz), Object.prototype);
});

test('validarVistas: estructura, inicio, tamaño y hostiles', () => {
  const ok = { version: 2, inicio: 'v_a', vistas: [{ id: 'v_a', nombre: ' Inicio ', raiz: col(w()) }] };
  const r = validarVistas(ok);
  assert.equal(r.datos.vistas[0].nombre, 'Inicio');
  assert.equal(r.datos.inicio, 'v_a');
  assert.equal(validarVistas({ ...ok, inicio: undefined }).datos.inicio, 'v_a');
  const mal = [null, 'x', [], {}, { ...ok, version: 1 }, { ...ok, inicio: 'v_b' }, { ...ok, vistas: [] }, { ...ok, vistas: 'x' }, { ...ok, extra: 1 },
    { ...ok, vistas: [ok.vistas[0], { ...ok.vistas[0], id: 'v_b' }] }, { ...ok, vistas: [{ ...ok.vistas[0], id: 'resumen' }] },
    { ...ok, vistas: [{ ...ok.vistas[0], nombre: '' }] }, { ...ok, vistas: [{ ...ok.vistas[0], nombre: 'x'.repeat(61) }] },
    { ...ok, vistas: [{ ...ok.vistas[0], enlace: '/etc' }] }, JSON.parse('{"__proto__":{},"version":2,"vistas":[]}'),
    { ...ok, vistas: Array(21).fill(ok.vistas[0]) }, { ...ok, vistas: [{ ...ok.vistas[0], raiz: col(...Array(6).fill(w('gasto', { ajustes: {} }))), nombre: 'x'.repeat(60) }], relleno: 'y'.repeat(70000) }];
  for (const m of mal) { assert.doesNotThrow(() => validarVistas(m)); assert.ok(validarVistas(m).error); }
});

test('migración: sin vistas.json sale v_resumen desde diseno.json, sin escribir ni tocar diseno.json', () => {
  const trabajo = temporal();
  const v = new Vistas({ trabajo });
  const r = v.leer();
  assert.equal(fs.existsSync(path.join(trabajo, 'panel')), false);
  assert.equal(r.version, 2);
  assert.equal(r.inicio, 'v_resumen');
  assert.equal(r.vistas.length, 1);
  assert.deepEqual(hojasDe(r.vistas[0].raiz).map((h) => h.tipo), IDS);
  assert.ok(validarVistas(r).datos);
  // orden personalizado en diseno.json
  fs.mkdirSync(path.join(trabajo, 'panel'));
  const diseno = path.join(trabajo, 'panel', 'diseno.json');
  const texto = `${JSON.stringify({ orden: ['chats', 'gasto', 'cifras'] })}\n`;
  fs.writeFileSync(diseno, texto);
  const r2 = new Vistas({ trabajo }).leer();
  assert.deepEqual(hojasDe(r2.vistas[0].raiz).map((h) => h.tipo).slice(0, 3), ['chats', 'gasto', 'cifras']);
  assert.equal(fs.readFileSync(diseno, 'utf8'), texto);
  assert.deepEqual(fs.readdirSync(path.join(trabajo, 'panel')), ['diseno.json']);
  // vistas.json corrupto: vuelve a migrar sin tocarlo
  fs.writeFileSync(v.archivo, '{roto');
  assert.equal(v.leer().inicio, 'v_resumen');
  assert.equal(fs.readFileSync(v.archivo, 'utf8'), '{roto');
});

test('guardar: atómico, relee idéntico, rechaza sin escribir y limpia el temporal si falla', () => {
  const trabajo = temporal();
  const v = new Vistas({ trabajo });
  assert.ok(v.guardar({ version: 2, vistas: [] }).error);
  assert.equal(fs.existsSync(v.archivo), false);
  const { datos } = v.guardar(v.migrada());
  assert.deepEqual(v.leer(), datos);
  assert.deepEqual(fs.readdirSync(v.dir), ['vistas.json']);
  const otro = temporal();
  const f = new Vistas({ trabajo: otro });
  fs.mkdirSync(f.archivo, { recursive: true });
  assert.throws(() => f.guardar(f.migrada()));
  assert.deepEqual(fs.readdirSync(f.dir), ['vistas.json']);
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

test('ruta /api/vistas: sesión, cabecera, validación, tamaño, guardado y métodos', async (t) => {
  const trabajo = temporal();
  const codigo = 'ABCD-EFGH-JKLM';
  const servidor = crearServidor({ trabajo, memoria: null, acceso: crearAcceso(codigo) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const cookie = crearAcceso(codigo).cookie.split(';')[0];
  const local = { host: 'localhost:4321', 'x-nullraptor': '1', cookie };

  assert.equal((await pedir(port, 'GET', '/api/vistas', { cab: { host: '192.168.1.20:4321' } })).estado, 401);
  const inicial = await pedir(port, 'GET', '/api/vistas', { cab: local });
  assert.equal(inicial.estado, 200);
  assert.equal(inicial.datos.inicio, 'v_resumen');
  assert.equal(fs.existsSync(path.join(trabajo, 'panel')), false);

  const nueva = { version: 2, inicio: 'v_resumen', vistas: [{ id: 'v_resumen', nombre: 'Resumen', raiz: col(w('chats'), w('gasto')) }] };
  assert.equal((await pedir(port, 'PUT', '/api/vistas', { cuerpo: nueva, cab: { host: 'localhost:4321', cookie } })).estado, 403);
  assert.equal((await pedir(port, 'PUT', '/api/vistas', { cuerpo: 'null', cab: local })).estado, 400);
  assert.equal((await pedir(port, 'PUT', '/api/vistas', { cuerpo: '{no', cab: local })).estado, 400);
  const malo = await pedir(port, 'PUT', '/api/vistas', { cuerpo: { ...nueva, vistas: [{ ...nueva.vistas[0], raiz: w('terminal') }] }, cab: local });
  assert.equal(malo.estado, 400);
  assert.match(malo.datos.error, /tipo/);
  assert.equal(fs.existsSync(path.join(trabajo, 'panel', 'vistas.json')), false);
  const grande = await pedir(port, 'PUT', '/api/vistas', { cuerpo: JSON.stringify({ ...nueva, relleno: 'x'.repeat(70 * 1024) }), cab: local }).catch((e) => ({ estado: e.code }));
  assert.ok(grande.estado === 413 || grande.estado === 'ECONNRESET', String(grande.estado));

  const put = await pedir(port, 'PUT', '/api/vistas', { cuerpo: nueva, cab: local });
  assert.equal(put.estado, 200);
  assert.deepEqual(hojasDe(put.datos.vistas[0].raiz).map((h) => h.tipo), ['chats', 'gasto']);
  assert.deepEqual((await pedir(port, 'GET', '/api/vistas', { cab: local })).datos, put.datos);
  assert.equal((await pedir(port, 'DELETE', '/api/vistas', { cab: local })).estado, 405);
  assert.deepEqual(fs.readdirSync(path.join(trabajo, 'panel')), ['vistas.json']);
});
