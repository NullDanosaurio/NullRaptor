// Ajustes del equipo desde el panel: el pedido para el lanzador de Windows (acceso y carpetas) y quién puede hacerlo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { crearAcceso } from '../panel/lib/acceso.mjs';
import { Equipo } from '../panel/lib/equipo.mjs';
import { crearServidor } from '../panel/servidor.mjs';

const LANZADOR = { NULLRAPTOR_LANZADOR: 'windows', PANEL_RED: '0', PANEL_DOMINIO: '', NULLRAPTOR_CARPETAS: 'C:\\Users\\Dano\\3D' };
const temporal = () => fs.mkdtempSync(path.join(os.tmpdir(), 'equipo-'));

test('actual: lo que puso el lanzador en el entorno', () => {
  const e = new Equipo({ trabajo: temporal(), env: { ...LANZADOR, PANEL_RED: '1', PANEL_DOMINIO: 'pc.tail.ts.net' } });
  assert.deepEqual(e.actual(), { lanzador: true, red: true, tailscale: true, dominio: 'pc.tail.ts.net', carpetas: ['C:\\Users\\Dano\\3D'] });
  assert.equal(new Equipo({ trabajo: temporal(), env: {} }).actual().lanzador, false);
});

test('pedir: valida, normaliza y quita duplicados; si no cambia nada, no hay pedido', () => {
  const trabajo = temporal();
  const e = new Equipo({ trabajo, env: LANZADOR });
  const p = e.pedir({ red: true, tailscale: false, carpetas: ['C:\\Users\\Dano\\3D\\', 'c:\\users\\dano\\3d', 'D:\\'] }, 'iPhone');
  assert.deepEqual(p.carpetas, ['C:\\Users\\Dano\\3D', 'D:\\']);
  assert.equal(p.quien, 'iPhone');
  assert.deepEqual(e.estado().pedido, p);
  // Igual que lo que hay: se retira el pedido anterior.
  assert.equal(e.pedir({ red: false, tailscale: false, carpetas: ['C:\\Users\\Dano\\3D'] }), null);
  assert.equal(e.estado().pedido, null);
  for (const carpetas of [['/etc'], ['\\\\servidor\\x'], ['C:\\a?b'], ['C:/x'], [7], Array(21).fill('C:\\x')]) {
    assert.throws(() => e.pedir({ red: false, tailscale: false, carpetas }), (x) => x.codigo === 400, JSON.stringify(carpetas).slice(0, 40));
  }
  assert.throws(() => e.pedir({ red: 'sí', tailscale: false, carpetas: [] }), (x) => x.codigo === 400);
  assert.throws(() => new Equipo({ trabajo, env: {} }).pedir({ red: true, tailscale: false, carpetas: [] }), (x) => x.codigo === 409);
  e.pedir({ red: true, tailscale: true, carpetas: [], ahora: true });
  assert.equal(e.cancelar(), true);
  assert.equal(e.cancelar(), false);
});

function pedir(port, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(JSON.stringify(cuerpo));
    r.end();
  });
}

test('rutas: desde este equipo se pide (y queda en el registro); desde casa con solo el código, no', async (t) => {
  const trabajo = temporal();
  const codigo = 'ABCD-EFGH-JKLM';
  const apuntes = [];
  const registro = { acceso: (x) => apuntes.push(x), aviso: (x) => apuntes.push(x), sesion: () => () => {} };
  const servidor = crearServidor({ trabajo, memoria: null, acceso: crearAcceso(codigo), registro, equipo: new Equipo({ trabajo, env: LANZADOR }) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const cookie = crearAcceso(codigo).cookie.split(';')[0];
  const local = { host: 'localhost:4321', 'x-nullraptor': '1', cookie };
  const casa = { ...local, host: '192.168.1.20:4321' };
  const cuerpo = { red: true, tailscale: false, carpetas: ['C:\\Users\\Dano\\3D'] };
  assert.equal((await pedir(port, 'GET', '/api/equipo', { cab: casa })).datos.cambiar, false);
  assert.equal((await pedir(port, 'POST', '/api/equipo', { cuerpo, cab: casa })).estado, 403);
  const r = await pedir(port, 'POST', '/api/equipo', { cuerpo, cab: local });
  assert.equal(r.estado, 200);
  assert.equal(r.datos.pedido.red, true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, 'equipo', 'pedido.json'), 'utf8')).id, r.datos.pedido.id);
  assert.ok(apuntes.some((x) => x.evento === 'ajustes del equipo: pedido'));
  assert.ok(apuntes.some((x) => typeof x === 'string' && /Ajustes del equipo pedidos/.test(x)));
  assert.equal((await pedir(port, 'POST', '/api/equipo', { cuerpo: { ...cuerpo, carpetas: ['/etc'] }, cab: local })).estado, 400);
  assert.equal((await pedir(port, 'POST', '/api/equipo/cancelar', { cab: local })).datos.ok, true);
});

test('la raíz de una unidad (el lanzador la guarda como «D:») se ve y se pide como «D:\\»', () => {
  const e = new Equipo({ trabajo: temporal(), env: { ...LANZADOR, NULLRAPTOR_CARPETAS: 'D:|C:\\x' } });
  assert.deepEqual(e.actual().carpetas, ['D:\\', 'C:\\x']);
  assert.equal(e.pedir({ red: false, tailscale: false, carpetas: ['D:\\', 'C:\\x'] }), null);
});

test('como aplicación: el panel sirve su manifiesto con el tipo correcto e iconos PNG', async (t) => {
  const dist = new URL('../panel/dist/', import.meta.url);
  if (!fs.existsSync(new URL('index.html', dist))) { t.skip('web sin construir (npm run panel:construir)'); return; }
  const servidor = crearServidor({ trabajo: temporal(), memoria: null });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const traer = (ruta) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: ruta, headers: { host: 'localhost:4321' } }, (res) => {
      const trozos = [];
      res.on('data', (x) => trozos.push(x));
      res.on('end', () => resolve({ tipo: res.headers['content-type'], cuerpo: Buffer.concat(trozos) }));
    }).on('error', reject);
  });
  const m = await traer('/manifest.webmanifest');
  assert.equal(m.tipo, 'application/manifest+json');
  const manifiesto = JSON.parse(m.cuerpo);
  assert.equal(manifiesto.display, 'standalone');
  for (const i of manifiesto.icons.filter((x) => x.type === 'image/png')) {
    const png = await traer(i.src);
    assert.equal(png.tipo, 'image/png');
    assert.equal(png.cuerpo.readUInt32BE(16), Number(i.sizes.split('x')[0])); // ancho en la cabecera IHDR
  }
  assert.match((await traer('/')).cuerpo.toString(), /rel="manifest"/);
});
