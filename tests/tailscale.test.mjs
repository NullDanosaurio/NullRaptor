// El panel por Tailscale (PANEL_DOMINIO), de punta a punta contra el servidor: sin passkey no se entra, la primera
// passkey solo con el código del lanzador, Origin exacto, terminal con confirmación de 1 h, y modo red sin terminal.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { crearAcceso } from '../panel/lib/acceso.mjs';
import { Passkeys, Sesiones } from '../panel/lib/passkey.mjs';
import { crearServidor } from '../panel/servidor.mjs';
import { DOMINIO, autenticador } from './apoyo/autenticador.mjs';
import { entorno, nuevo } from './apoyo/remoto.mjs';

const CODIGO = 'ABCD-EFGH-JKLM';
const ORIGEN = `https://${DOMINIO}`;

function pedir(puerto, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, cab: res.headers, datos: d && res.headers['content-type']?.includes('json') ? JSON.parse(d) : d }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(JSON.stringify(cuerpo));
    r.end();
  });
}

async function arrancar(t, { acceso = null } = {}) {
  const e = entorno();
  let ahora = 1_000_000_000;
  const reloj = () => ahora;
  const passkeys = new Passkeys({ archivo: path.join(e.base, 'passkeys.json'), dominio: DOMINIO, ahora: reloj });
  const sesiones = new Sesiones({ ahora: reloj });
  const { remoto, lanzados } = nuevo(e);
  const servidor = crearServidor({ trabajo: e.trabajo, memoria: null, acceso, remoto, dominio: DOMINIO, passkeys, sesiones, codigoLanzador: crearAcceso(CODIGO).probar });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => { remoto.cerrarTodas(); servidor.close(); });
  const { port } = servidor.address();
  const fuera = (cab = {}) => ({ host: DOMINIO, 'x-forwarded-for': '100.64.0.9', 'tailscale-user-login': 'dano@ejemplo.com', ...cab });
  const escribir = (cab = {}) => fuera({ 'x-nullraptor': '1', origin: ORIGEN, ...cab });
  return { e, port, passkeys, remoto, lanzados, fuera, escribir, avanzar: (ms) => { ahora += ms; } };
}

/** Da de alta una passkey con el código del lanzador y devuelve la cookie de sesión. */
async function darDeAlta(port, escribir, a, codigo = CODIGO) {
  const o = await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo }, cab: escribir() });
  assert.equal(o.estado, 200, JSON.stringify(o.datos));
  const r = await pedir(port, 'POST', '/entrar/alta', { cuerpo: { nombre: 'Móvil', respuesta: a.alta(o.datos) }, cab: escribir() });
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
  return r.cab['set-cookie'][0].split(';')[0];
}

test('sin passkey no se entra por el dominio; este equipo sigue igual; otro Host, 421', async (t) => {
  const { port, fuera } = await arrancar(t);
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: fuera() })).estado, 401);
  const pagina = await pedir(port, 'GET', '/', { cab: fuera() });
  assert.equal(pagina.estado, 303);
  assert.equal(pagina.cab.location, '/entrar');
  assert.match((await pedir(port, 'GET', '/entrar', { cab: fuera() })).datos, /Código del lanzador/);
  assert.equal((await pedir(port, 'GET', '/entrar.js', { cab: fuera() })).estado, 200);
  // Por localhost pero llegando por un proxy: también remota.
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: { host: 'localhost:4321', 'x-forwarded-for': '100.64.0.9' } })).estado, 401);
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: { host: 'localhost:4321' } })).estado, 200);
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: { host: 'evil.com' } })).estado, 421);
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: { host: `${DOMINIO}.evil.com` } })).estado, 421);
});

test('alta: Origin exacto, código del lanzador solo para la primera y luego solo códigos de alta', async (t) => {
  const { port, escribir, fuera } = await arrancar(t);
  const a = autenticador();
  assert.equal((await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: CODIGO }, cab: fuera({ 'x-nullraptor': '1' }) })).estado, 403); // sin Origin
  assert.equal((await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: CODIGO }, cab: escribir({ origin: 'https://evil.com' }) })).estado, 403);
  assert.equal((await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: 'MAL' }, cab: escribir() })).estado, 401);
  const cookie = await darDeAlta(port, escribir, a);
  assert.match(cookie, /^__Host-nr_pk=/);
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: fuera({ cookie }) })).estado, 200);
  // Ya hay passkey: el código del lanzador deja de valer para dar de alta.
  assert.equal((await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: CODIGO }, cab: escribir() })).estado, 401);
  // Código de alta de un solo uso, sacado desde la sesión.
  const alta = await pedir(port, 'POST', '/api/seguridad/alta', { cab: escribir({ cookie }) });
  assert.equal(alta.estado, 200);
  assert.equal(alta.datos.url, `${ORIGEN}/entrar?alta=${alta.datos.codigo}`);
  await darDeAlta(port, escribir, autenticador(), alta.datos.codigo);
  assert.equal((await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: alta.datos.codigo }, cab: escribir() })).estado, 401);
  const seg = await pedir(port, 'GET', '/api/seguridad', { cab: fuera({ cookie }) });
  assert.equal(seg.datos.passkeys.length, 2);
  assert.equal(seg.datos.remota, true);
});

test('entrada con passkey y límite de fallos', async (t) => {
  const { port, escribir, fuera } = await arrancar(t);
  const a = autenticador();
  await darDeAlta(port, escribir, a);
  const o = await pedir(port, 'POST', '/entrar/opciones', { cab: escribir() });
  const r = await pedir(port, 'POST', '/entrar/passkey', { cuerpo: a.entrar(o.datos), cab: escribir() });
  assert.equal(r.estado, 200);
  const cookie = r.cab['set-cookie'][0].split(';')[0];
  assert.equal((await pedir(port, 'GET', '/api/remoto', { cab: fuera({ cookie }) })).estado, 200);
  assert.equal((await pedir(port, 'POST', '/api/seguridad/salir', { cab: escribir({ cookie }) })).estado, 200);
  assert.equal((await pedir(port, 'GET', '/api/remoto', { cab: fuera({ cookie }) })).estado, 401);
  for (let i = 0; i < 10; i++) await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: 'MAL' }, cab: escribir() });
  assert.equal((await pedir(port, 'POST', '/entrar/opciones', { cab: escribir() })).estado, 429);
});

test('terminal por Tailscale: confirmar la passkey cada hora; Origin exacto también dentro', async (t) => {
  const { port, escribir, fuera, avanzar, lanzados } = await arrancar(t);
  const a = autenticador();
  const cookie = await darDeAlta(port, escribir, a);
  // Recién dada de alta cuenta como confirmada.
  const abierta = await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'A' }, cab: escribir({ cookie }) });
  assert.equal(abierta.estado, 201);
  assert.match(lanzados[0].args.join(' '), /--permission-mode manual/);
  assert.match(abierta.datos.quien, /dano@ejemplo\.com · passkey Móvil/);
  const id = abierta.datos.id;
  assert.equal((await pedir(port, 'POST', `/api/remoto/${id}/entrada`, { cuerpo: { datos: 'hola' }, cab: escribir({ cookie, origin: 'https://evil.com' }) })).estado, 403);
  assert.equal((await pedir(port, 'POST', `/api/remoto/${id}/entrada`, { cuerpo: { datos: 'hola' }, cab: escribir({ cookie }) })).estado, 202);
  assert.equal(lanzados[0].stdin.read(), 'hola');
  // Pasada la hora: hay que confirmar.
  avanzar(61 * 60_000);
  const no = await pedir(port, 'POST', `/api/remoto/${id}/entrada`, { cuerpo: { datos: 'x' }, cab: escribir({ cookie }) });
  assert.equal(no.estado, 403);
  assert.equal(no.datos.reautenticar, true);
  assert.equal((await pedir(port, 'GET', `/api/remoto/${id}/terminal`, { cab: fuera({ cookie }) })).estado, 403);
  assert.equal((await pedir(port, 'POST', '/api/seguridad/alta', { cab: escribir({ cookie }) })).estado, 403);
  const o = await pedir(port, 'POST', '/api/seguridad/reautenticar/opciones', { cab: escribir({ cookie }) });
  assert.equal((await pedir(port, 'POST', '/api/seguridad/reautenticar', { cuerpo: a.entrar(o.datos), cab: escribir({ cookie }) })).estado, 200);
  assert.equal((await pedir(port, 'POST', `/api/remoto/${id}/entrada`, { cuerpo: { datos: 'y' }, cab: escribir({ cookie }) })).estado, 202);
  // Cerrar no exige confirmar.
  assert.equal((await pedir(port, 'POST', `/api/remoto/${id}/cerrar`, { cab: escribir({ cookie }) })).estado, 200);
});

test('este equipo usa la terminal sin passkey; la red de casa con solo el código, no', async (t) => {
  const { port, lanzados } = await arrancar(t, { acceso: crearAcceso(CODIGO) });
  const local = { host: 'localhost:4321', 'x-nullraptor': '1', cookie: crearAcceso(CODIGO).cookie.split(';')[0] };
  const abierta = await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'A' }, cab: local });
  assert.equal(abierta.estado, 201);
  assert.equal(abierta.datos.quien, 'este equipo');
  const casa = { ...local, host: '192.168.1.20:4321' };
  const no = await pedir(port, 'POST', `/api/remoto/${abierta.datos.id}/entrada`, { cuerpo: { datos: 'x' }, cab: casa });
  assert.equal(no.estado, 403);
  assert.match(no.datos.error, /solo se usa desde este equipo o por Tailscale/);
  assert.equal((await pedir(port, 'GET', '/api/remoto', { cab: casa })).datos.terminal, false);
  assert.equal(lanzados.length, 1);
});

test('registro de accesos: altas y fallos quedan en el volumen', async (t) => {
  const e = entorno();
  const { Registro } = await import('../panel/lib/registro.mjs');
  const registro = new Registro({ carpeta: path.join(e.base, 'registros') });
  const passkeys = new Passkeys({ archivo: path.join(e.base, 'passkeys.json'), dominio: DOMINIO });
  const servidor = crearServidor({ trabajo: e.trabajo, memoria: null, registro, dominio: DOMINIO, passkeys, codigoLanzador: crearAcceso(CODIGO).probar });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const escribir = () => ({ host: DOMINIO, 'x-nullraptor': '1', origin: ORIGEN, 'tailscale-user-login': 'dano@ejemplo.com' });
  await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: 'MAL' }, cab: escribir() });
  await darDeAlta(port, escribir, autenticador());
  const lineas = fs.readFileSync(path.join(e.base, 'registros', 'accesos.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lineas.map((l) => l.evento), ['fallo', 'alta']);
  assert.match(lineas[1].quien, /dano@ejemplo\.com/);
  assert.equal(fs.statSync(path.join(e.base, 'registros', 'accesos.jsonl')).mode & 0o077, 0);
});
