// Pruebas de passkeys (WebAuthn) y sesiones con un autenticador simulado (claves P-256 reales de node:crypto).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Passkeys, Sesiones, RETO_MS } from '../panel/lib/passkey.mjs';
import { esRemota, quienEs } from '../panel/lib/entrada.mjs';
import { DOMINIO, autenticador } from './apoyo/autenticador.mjs';

function nuevas(ahora = Date.now) {
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pk-')), 'passkeys.json');
  return new Passkeys({ archivo, dominio: DOMINIO, ahora });
}
const codigo = (n) => (e) => e.codigo === n;

test('alta y entrada con una passkey; el contador sube y el archivo es privado', () => {
  const pk = nuevas();
  const a = autenticador();
  assert.equal(pk.hay(), false);
  const opciones = pk.opcionesAlta();
  assert.equal(opciones.rp.id, DOMINIO);
  assert.equal(opciones.authenticatorSelection.userVerification, 'required');
  assert.deepEqual(pk.registrar(a.alta(opciones), 'Móvil <b>'), { id: a.id, nombre: 'Móvil b' });
  assert.equal(pk.hay(), true);
  assert.equal(fs.statSync(pk.archivo).mode & 0o077, 0);
  assert.equal(pk.verificar(a.entrar(pk.opcionesEntrada())).id, a.id);
  assert.equal(pk.leer().claves[0].contador, 1);
  assert.ok(pk.lista()[0].usada);
  assert.equal(pk.lista()[0].clave, undefined); // la lista no saca la clave
});

test('la entrada rechaza reto repetido, caducado o de otro tipo', () => {
  let t = 1_000_000;
  const pk = nuevas(() => t);
  const a = autenticador();
  pk.registrar(a.alta(pk.opcionesAlta()));
  const r = a.entrar(pk.opcionesEntrada());
  pk.verificar(r);
  assert.throws(() => pk.verificar(r), codigo(401)); // un solo uso
  const viejo = a.entrar(pk.opcionesEntrada());
  t += RETO_MS + 1;
  assert.throws(() => pk.verificar(viejo), codigo(401));
  assert.throws(() => pk.verificar(a.entrar(pk.opcionesEntrada('reautenticar')), 'entrada'), codigo(401));
  assert.throws(() => pk.registrar(a.alta(pk.opcionesEntrada())), codigo(401)); // reto de entrada para un alta
});

test('la entrada rechaza origen, dominio, usuario sin verificar, firma ajena y contador que no sube', () => {
  const pk = nuevas();
  const a = autenticador();
  pk.registrar(a.alta(pk.opcionesAlta()));
  assert.throws(() => pk.verificar(a.entrar(pk.opcionesEntrada(), { origen: 'https://evil.com' })), codigo(403));
  assert.throws(() => pk.verificar(autenticador('evil.com').entrar(pk.opcionesEntrada())), (e) => e.codigo === 401 || e.codigo === 403);
  assert.throws(() => pk.verificar(a.entrar(pk.opcionesEntrada(), { banderas: 0x01 })), codigo(403)); // sin UV
  const otra = autenticador();
  const falsa = { ...otra.entrar(pk.opcionesEntrada()), id: a.id }; // firma con otra clave
  assert.throws(() => pk.verificar(falsa), codigo(401));
  pk.verificar(a.entrar(pk.opcionesEntrada(), { fijo: 10 }));
  assert.throws(() => pk.verificar(a.entrar(pk.opcionesEntrada(), { fijo: 10 })), codigo(401)); // ¿clonada?
  assert.throws(() => pk.verificar({ ...a.entrar(pk.opcionesEntrada()), signature: '../../x' }), codigo(400));
});

test('el alta rechaza otro dominio, otro origen, sin verificar, id que no cuadra y duplicados', () => {
  const pk = nuevas();
  const a = autenticador();
  assert.throws(() => pk.registrar(autenticador('evil.com').alta(pk.opcionesAlta())), codigo(403));
  assert.throws(() => pk.registrar(a.alta(pk.opcionesAlta(), { origen: 'http://pc.colita.ts.net' })), codigo(403));
  assert.throws(() => pk.registrar(a.alta(pk.opcionesAlta(), { banderas: 0x41 })), codigo(403));
  assert.throws(() => pk.registrar({ ...a.alta(pk.opcionesAlta()), id: 'otro' }), codigo(400));
  assert.throws(() => pk.registrar({ ...a.alta(pk.opcionesAlta()), alg: -999 }), codigo(400));
  pk.registrar(a.alta(pk.opcionesAlta()));
  assert.throws(() => pk.registrar(a.alta(pk.opcionesAlta())), codigo(409));
});

test('códigos de alta: un solo uso, caducan, y no se borra la última passkey', () => {
  let t = 5_000_000;
  const pk = nuevas(() => t);
  const { codigo: c } = pk.codigoAlta();
  assert.match(c, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.ok(pk.usarCodigoAlta(c.toLowerCase().replace('-', ' ')));
  assert.ok(!pk.usarCodigoAlta(c));
  const otro = pk.codigoAlta().codigo;
  t += 11 * 60_000;
  assert.ok(!pk.usarCodigoAlta(otro));
  const a = autenticador();
  const b = autenticador();
  pk.registrar(a.alta(pk.opcionesAlta()), 'A');
  pk.registrar(b.alta(pk.opcionesAlta()), 'B');
  assert.ok(pk.borrar(a.id));
  assert.throws(() => pk.borrar(b.id), codigo(409));
  assert.equal(pk.borrar('no-existe'), false);
});

test('sesiones: cookie __Host- segura, 12 h como mucho, 2 h sin uso, confirmación de 1 h', () => {
  let t = 0;
  const s = new Sesiones({ ahora: () => t });
  const token = s.crear({ id: 'x', nombre: 'Móvil' });
  const cookie = s.cookie(token);
  assert.match(cookie, /^__Host-nr_pk=/);
  for (const f of ['Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert.ok(cookie.includes(f), f);
  const req = { headers: { cookie: `otra=1; __Host-nr_pk=${token}` } };
  assert.ok(s.leer(req));
  assert.equal(s.leer({ headers: { cookie: '__Host-nr_pk=falsa' } }), null);
  t += 61 * 60_000;
  const ses = s.leer(req);
  assert.ok(ses && !s.reautenticada(ses));
  t += 121 * 60_000;
  assert.equal(s.leer(req), null); // 2 h sin uso
  const t2 = s.crear({});
  const req2 = { headers: { cookie: `__Host-nr_pk=${t2}` } };
  for (let i = 0; i < 13; i++) { t += 59 * 60_000; s.leer(req2); }
  assert.equal(s.leer(req2), null); // 12 h como mucho
  const t3 = s.crear({});
  s.cerrar({ headers: { cookie: `__Host-nr_pk=${t3}` } });
  assert.equal(s.leer({ headers: { cookie: `__Host-nr_pk=${t3}` } }), null);
});

test('esRemota: por el dominio o con cabeceras de proxy; quienEs limpia lo que viene de fuera', () => {
  assert.ok(!esRemota({ headers: { host: 'localhost:4321' } }, DOMINIO));
  assert.ok(esRemota({ headers: { host: `${DOMINIO}` } }, DOMINIO));
  assert.ok(esRemota({ headers: { host: 'localhost:4321', 'x-forwarded-for': '100.64.0.2' } }, DOMINIO));
  assert.ok(esRemota({ headers: { host: '127.0.0.1:4321', 'tailscale-user-login': 'a@b.c' } }, DOMINIO));
  assert.ok(!esRemota({ headers: { host: 'localhost', 'x-forwarded-for': '1.2.3.4' } }, null)); // sin Tailscale no aplica
  assert.equal(quienEs({ headers: { 'tailscale-user-login': 'dano@x.com<script>', 'x-forwarded-for': '100.64.0.2, 1.1.1.1' } }, { passkey: { nombre: 'iPhone' } }), 'dano@x.comscript · passkey iPhone · 100.64.0.2');
  assert.equal(quienEs({ headers: {} }), 'este equipo');
});
