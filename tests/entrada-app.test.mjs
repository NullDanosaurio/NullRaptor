// Entrada desde la app Android (panel/lib/entrada-app.mjs y sus rutas en entrada.mjs): se entra en Chrome y la sesión
// pasa a la app con un código de un solo uso que solo vale con el verificador de la app (como PKCE).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { CODIGO_APP_MS, CodigosApp, desdeApp, retoDe } from '../panel/lib/entrada-app.mjs';
import { crearEntrada } from '../panel/lib/entrada.mjs';
import { REAUT_MS, Sesiones } from '../panel/lib/passkey.mjs';

const verificador = () => crypto.randomBytes(32).toString('base64url');
const PASSKEY = { id: 'k1', nombre: 'Móvil' };

test('códigos: un solo uso, caducan, y solo con el verificador correcto', () => {
  let t = 1_000;
  const c = new CodigosApp({ ahora: () => t });
  const v = verificador();
  const codigo = c.emitir(PASSKEY, retoDe(v));
  assert.equal(c.canjear(codigo, verificador()), null); // verificador ajeno…
  assert.equal(c.canjear(codigo, v), null); // …y el código ya se gastó
  const otro = c.emitir(PASSKEY, retoDe(v));
  assert.deepEqual(c.canjear(otro, v), PASSKEY);
  assert.equal(c.canjear(otro, v), null);
  const tarde = c.emitir(PASSKEY, retoDe(v));
  t += CODIGO_APP_MS + 1;
  assert.equal(c.canjear(tarde, v), null);
  assert.throws(() => c.emitir(PASSKEY, 'corto'), (e) => e.codigo === 400);
  assert.equal(c.canjear('no-existe', v), null);
  assert.equal(c.canjear(c.emitir(PASSKEY, retoDe(v)), 'mal verificador'), null);
});

test('desdeApp: por la marca del user agent', () => {
  assert.equal(desdeApp({ headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 15) … NullraptorApp/0.1' } }), true);
  assert.equal(desdeApp({ headers: { 'user-agent': 'Mozilla/5.0 Chrome/156' } }), false);
});

/** Rutas reales de entrada.mjs con respuestas en memoria. */
function rutas() {
  let t = 5_000_000;
  const sesiones = new Sesiones({ ahora: () => t });
  const respuestas = [];
  const html = (res, estado, cuerpo, extra = {}) => respuestas.push({ estado, cuerpo, cab: extra });
  const json = (res, estado, cuerpo, extra = {}) => respuestas.push({ estado, cuerpo, cab: extra });
  const manejar = crearEntrada({ passkeys: { hay: () => true }, sesiones, codigoLanzador: () => 'mal', leerCuerpo: async () => ({}), json, html, ahora: () => t });
  const pedir = async (url, cab = {}) => { await manejar({ url, method: 'GET', headers: cab }, {}, url.split('?')[0]); return respuestas.at(-1); };
  return { sesiones, pedir, pasar: (ms) => { t += ms; } };
}

test('flujo completo: Chrome con passkey reciente → código → la app canjea y recibe su sesión', async () => {
  const { sesiones, pedir, pasar } = rutas();
  const v = verificador();
  // Sin sesión: la página de passkey normal (Chrome entra y recarga).
  assert.match((await pedir(`/vincular-app?reto=${retoDe(v)}`)).cuerpo, /Entrar con passkey/);
  // Con sesión recién confirmada: el enlace para volver a la app.
  const token = sesiones.crear(PASSKEY);
  const cookie = sesiones.cookie(token).split(';')[0];
  const pagina = await pedir(`/vincular-app?reto=${retoDe(v)}`, { cookie });
  const codigo = decodeURIComponent(pagina.cuerpo.match(/es\.nullraptor\.movil:\/\/sesion\?codigo=([^"&]+)/)[1]);
  assert.equal(pagina.cab['Cache-Control'], 'no-store');
  // La app canjea: sesión nueva (cookie) y al panel.
  const canje = await pedir(`/entrar/app?codigo=${encodeURIComponent(codigo)}&verificador=${v}`);
  assert.equal(canje.estado, 303);
  assert.equal(canje.cab.Location, '/');
  const nueva = canje.cab['Set-Cookie'].split(';')[0];
  assert.deepEqual(sesiones.leer({ headers: { cookie: nueva } }).passkey, PASSKEY);
  // Repetirlo no vale.
  assert.equal((await pedir(`/entrar/app?codigo=${encodeURIComponent(codigo)}&verificador=${v}`)).estado, 401);
  // Con la passkey confirmada hace más de 1 h, Chrome vuelve a pedirla antes de dar código.
  pasar(REAUT_MS + 1);
  assert.match((await pedir(`/vincular-app?reto=${retoDe(v)}`, { cookie })).cuerpo, /Entrar con passkey/);
});

test('dentro de la app, /entrar ofrece entrar por Chrome en vez de la passkey', async () => {
  const { pedir } = rutas();
  const app = await pedir('/entrar', { 'user-agent': 'Mozilla/5.0 NullraptorApp/0.1' });
  assert.match(app.cuerpo, /href="es\.nullraptor\.movil:\/\/entrar"/);
  assert.doesNotMatch(app.cuerpo, /id="entrar"/);
  assert.match((await pedir('/entrar', { 'user-agent': 'Chrome' })).cuerpo, /id="entrar"/);
});
