// Pruebas del modo red del panel: código de acceso, cookie de sesión, hosts de casa y límite de intentos.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { codigoNuevo, crearAcceso, hostRed, leerOCrearCodigo } from '../panel/lib/acceso.mjs';
import { crearServidor, hostPermitido } from '../panel/servidor.mjs';

function pedir(puerto, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: cab }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, cab: res.headers, texto: d }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(cuerpo);
    r.end();
  });
}

test('código: 12 caracteres legibles; se crea una vez y se reutiliza', () => {
  assert.match(codigoNuevo(), /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'acceso-')), 'sub', 'codigo');
  const c = leerOCrearCodigo(archivo);
  assert.equal(leerOCrearCodigo(archivo), c);
});

test('hostRed: casa sí, internet no; sin modo red solo localhost', () => {
  for (const h of ['localhost:4321', '127.0.0.1', '192.168.1.40:4321', '10.0.0.2', '172.20.1.1', 'DESKTOP-ABC:4321', 'portatil.local', 'nas.lan']) assert.ok(hostRed(h), h);
  for (const h of ['evil.com', 'localhost.evil.com', '8.8.8.8', '172.32.0.1', '192.168.1.300', '', 'a b']) assert.ok(!hostRed(h), h);
  assert.ok(!hostPermitido('192.168.1.40:4321'));
});

test('probar: acepta el código sin guiones ni mayúsculas y bloquea tras 10 fallos por minuto', () => {
  let t = 0;
  const a = crearAcceso('ABCD-EFGH-JKLM', { ahora: () => t });
  assert.equal(a.probar('abcdefghjklm'), 'ok');
  for (let i = 0; i < 10; i++) assert.equal(a.probar('MAL'), 'mal');
  assert.equal(a.probar('ABCD-EFGH-JKLM'), 'bloqueado');
  t = 61_000;
  assert.equal(a.probar('ABCD-EFGH-JKLM'), 'ok');
});

test('servidor en modo red: sin sesión no se ve nada; con el código, cookie y acceso', async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'acceso-'));
  const servidor = crearServidor({ trabajo: base, memoria: null, acceso: crearAcceso('ABCD-EFGH-JKLM') });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const casa = { host: `192.168.1.40:${port}` };

  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: casa })).estado, 401);
  assert.equal((await pedir(port, 'GET', '/', { cab: casa })).cab.location, '/entrar');
  assert.equal((await pedir(port, 'GET', '/entrar', { cab: { host: 'evil.com' } })).estado, 421);
  assert.match((await pedir(port, 'GET', '/entrar', { cab: casa })).texto, /código de acceso/);

  const form = { ...casa, 'content-type': 'application/x-www-form-urlencoded' };
  assert.equal((await pedir(port, 'POST', '/entrar', { cuerpo: 'codigo=MAL', cab: form })).estado, 401);
  assert.equal((await pedir(port, 'POST', '/entrar', { cuerpo: 'codigo=abcd-efgh-jklm', cab: { ...form, origin: 'http://evil.com' } })).estado, 403);
  // Formulario del móvil: con Referrer-Policy no-referrer el navegador manda «Origin: null».
  assert.equal((await pedir(port, 'POST', '/entrar', { cuerpo: 'codigo=abcd-efgh-jklm', cab: { ...form, origin: 'null' } })).estado, 303);
  const ok = await pedir(port, 'POST', '/entrar', { cuerpo: 'codigo=abcd-efgh-jklm', cab: form });
  assert.equal(ok.estado, 303);
  const cookie = ok.cab['set-cookie'][0];
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const sesion = { ...casa, cookie: cookie.split(';')[0] };
  assert.equal((await pedir(port, 'GET', '/api/proyectos', { cab: sesion })).estado, 200);
  assert.equal((await pedir(port, 'GET', '/api/proyectos', { cab: { ...casa, cookie: 'nr_sesion=falsa' } })).estado, 401);
  // Entrada directa del lanzador en este equipo.
  assert.equal((await pedir(port, 'GET', '/entrar?codigo=ABCD-EFGH-JKLM', { cab: { host: `localhost:${port}` } })).estado, 303);
});
