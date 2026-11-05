// Herramientas de punta a punta: el lanzador (solo arranca lo aprobado, sin credenciales del agente), la
// configuración MCP de las sesiones y las rutas del panel (aprobar desde este equipo, por Tailscale con passkey
// confirmada, nunca desde la red de casa con solo el código).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAcceso } from '../panel/lib/acceso.mjs';
import { Passkeys, Sesiones } from '../panel/lib/passkey.mjs';
import { crearServidor } from '../panel/servidor.mjs';
import { aprobar, huella } from '../scripts/herramientas.mjs';
import { ARCHIVO_MCP, escribirMcp } from '../scripts/ia.mjs';
import { DOMINIO, autenticador } from './apoyo/autenticador.mjs';
import { entorno, nuevo } from './apoyo/remoto.mjs';

const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANZADOR = path.join(agente, 'scripts', 'herramienta-mcp.mjs');
const CODIGO = 'ABCD-EFGH-JKLM';

// Servidor de juguete: contesta una línea con lo que ve (variables y carpeta).
const ECO = `process.stdin.once('data', (d) => { process.stdout.write(JSON.stringify({ recibido: String(d).trim(), clave: process.env.TIEMPO_CLAVE ?? null, github: process.env.GITHUB_TOKEN ?? null, cwd: process.cwd() }) + '\\n'); process.exit(0); });\n`;

function conHerramienta() {
  const e = entorno();
  const dir = path.join(e.trabajo, 'herramientas', 'tiempo');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'herramienta.json'), JSON.stringify({ nombre: 'Tiempo', tipo: 'mcp', mcp: { script: 'servidor.mjs', variables: [{ nombre: 'TIEMPO_CLAVE', secreta: true }] } }));
  fs.writeFileSync(path.join(dir, 'servidor.mjs'), ECO);
  return { ...e, dir, env: { HOME: e.base, PATH: process.env.PATH } };
}

const lanzar = (e, extra = {}) => spawnSync(process.execPath, [LANZADOR, 'tiempo'], { input: 'hola\n', encoding: 'utf8', env: { ...e.env, TRABAJO_DIR: e.trabajo, ...extra }, timeout: 10_000 });

test('lanzador: sin aprobar no arranca; aprobada, pasa la entrada y solo sus variables; si cambia, deja de arrancar', () => {
  const e = conHerramienta();
  const antes = lanzar(e, { TIEMPO_CLAVE: 'k' });
  assert.equal(antes.status, 1);
  assert.match(antes.stderr, /propuesta.*apruébala en el panel/);

  aprobar({ trabajo: e.trabajo, env: e.env, id: 'tiempo' });
  const r = lanzar(e, { TIEMPO_CLAVE: 'k', GITHUB_TOKEN: 'gh' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { recibido: 'hola', clave: 'k', github: null, cwd: fs.realpathSync(e.dir) });

  // Cambiada a mitad de sesión (p. ej. Claude la edita): el siguiente arranque se niega.
  fs.appendFileSync(path.join(e.dir, 'servidor.mjs'), '// cambio\n');
  const despues = lanzar(e, { TIEMPO_CLAVE: 'k' });
  assert.equal(despues.status, 1);
  assert.match(despues.stderr, /cambiada/);
  assert.equal(despues.stdout, '');
});

test('MCP de las sesiones: la aprobada entra con el lanzador; sin aprobar, no', () => {
  const e = conHerramienta();
  const env = { ...e.env, TIEMPO_CLAVE: 'k' };
  const leer = () => JSON.parse(fs.readFileSync(escribirMcp({ agente, env, memoria: null, trabajo: e.trabajo }), 'utf8')).mcpServers;
  assert.deepEqual(Object.keys(leer()), ['ruflo', 'context7']);
  aprobar({ trabajo: e.trabajo, env, id: 'tiempo' });
  const m = leer();
  assert.deepEqual(m['herramienta-tiempo'].args, [LANZADOR, 'tiempo']);
  assert.equal(m['herramienta-tiempo'].env.TIEMPO_CLAVE, 'k');
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(e.trabajo, ARCHIVO_MCP)).mode & 0o777, 0o600);
});

function pedir(puerto, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: d && res.headers['content-type']?.includes('json') ? JSON.parse(d) : d }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(JSON.stringify(cuerpo));
    r.end();
  });
}

async function arrancar(t, e, { acceso = null } = {}) {
  let ahora = 1_000_000_000;
  const reloj = () => ahora;
  const passkeys = new Passkeys({ archivo: path.join(e.base, 'passkeys.json'), dominio: DOMINIO, ahora: reloj });
  const sesiones = new Sesiones({ ahora: reloj });
  const { remoto } = nuevo(e);
  let rehechos = 0;
  const servidor = crearServidor({
    trabajo: e.trabajo, memoria: null, acceso, remoto, dominio: DOMINIO, passkeys, sesiones, codigoLanzador: crearAcceso(CODIGO).probar,
    env: e.env, prepararMcp: () => { rehechos += 1; },
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => { remoto.cerrarTodas(); servidor.close(); });
  const fuera = (cab = {}) => ({ host: DOMINIO, 'x-forwarded-for': '100.64.0.9', 'x-nullraptor': '1', origin: `https://${DOMINIO}`, ...cab });
  return { port: servidor.address().port, fuera, avanzar: (ms) => { ahora += ms; }, rehechos: () => rehechos };
}

test('panel: ver, revisar y aprobar desde este equipo; se rehace el MCP; huella vieja, 409', async (t) => {
  const e = conHerramienta();
  const { port, rehechos } = await arrancar(t, e);
  const local = { host: 'localhost:4321', 'x-nullraptor': '1' };
  const lista = await pedir(port, 'GET', '/api/herramientas', { cab: local });
  assert.equal(lista.estado, 200);
  const h = lista.datos.herramientas.find((x) => x.id === 'tiempo');
  assert.equal(h.estado, 'propuesta');
  assert.equal(JSON.stringify(lista.datos).includes(e.trabajo), false); // sin rutas del contenedor
  assert.deepEqual((await pedir(port, 'GET', '/api/herramientas/archivos?id=tiempo', { cab: local })).datos.archivos.map((a) => a.ruta), ['herramienta.json', 'servidor.mjs']);
  assert.equal((await pedir(port, 'GET', '/api/herramientas/archivo?id=tiempo&ruta=servidor.mjs', { cab: local })).datos.texto, ECO);
  assert.equal((await pedir(port, 'GET', '/api/herramientas/archivos?id=no-existe', { cab: local })).estado, 404);

  assert.equal((await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo' }, cab: local })).estado, 400); // sin huella
  assert.equal((await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: h.huella }, cab: { host: 'localhost:4321' } })).estado, 403); // CSRF
  fs.appendFileSync(path.join(e.dir, 'servidor.mjs'), '// otra\n');
  assert.equal((await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: h.huella }, cab: local })).estado, 409);
  assert.equal(rehechos(), 0);
  const ok = await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: huella(e.dir) }, cab: local });
  assert.equal(ok.estado, 200);
  assert.equal(rehechos(), 1);
  assert.equal((await pedir(port, 'GET', '/api/herramientas', { cab: local })).datos.herramientas.find((x) => x.id === 'tiempo').estado, 'aprobada');

  assert.equal((await pedir(port, 'POST', '/api/herramientas/desactivar', { cuerpo: { id: 'tiempo' }, cab: local })).estado, 200);
  assert.equal(rehechos(), 2);
  assert.equal((await pedir(port, 'POST', '/api/herramientas/desactivar', { cuerpo: { id: 'tiempo' }, cab: local })).estado, 404);
});

test('panel: por Tailscale, aprobar pide la passkey confirmada en la última hora', async (t) => {
  const e = conHerramienta();
  const { port, fuera, avanzar } = await arrancar(t, e);
  const a = autenticador();
  const o = await pedir(port, 'POST', '/entrar/alta/opciones', { cuerpo: { codigo: CODIGO }, cab: fuera() });
  const alta = await new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/entrar/alta', headers: { 'content-type': 'application/json', ...fuera() } }, (res) => { res.resume(); res.on('end', () => resolve(res.headers['set-cookie'][0].split(';')[0])); });
    r.on('error', reject);
    r.end(JSON.stringify({ nombre: 'Móvil', respuesta: a.alta(o.datos) }));
  });
  const cab = fuera({ cookie: alta });
  avanzar(61 * 60_000);
  const no = await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: huella(e.dir) }, cab });
  assert.equal(no.estado, 403);
  assert.equal(no.datos.reautenticar, true);
  const r = await pedir(port, 'POST', '/api/seguridad/reautenticar/opciones', { cab });
  assert.equal((await pedir(port, 'POST', '/api/seguridad/reautenticar', { cuerpo: a.entrar(r.datos), cab })).estado, 200);
  assert.equal((await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: huella(e.dir) }, cab })).estado, 200);
});

test('panel: la red de casa con solo el código no aprueba (sí ve y desactiva)', async (t) => {
  const e = conHerramienta();
  const { port } = await arrancar(t, e, { acceso: crearAcceso(CODIGO) });
  const casa = { host: '192.168.1.20:4321', 'x-nullraptor': '1', cookie: crearAcceso(CODIGO).cookie.split(';')[0] };
  const lista = await pedir(port, 'GET', '/api/herramientas', { cab: casa });
  assert.equal(lista.datos.aprobar, false);
  const no = await pedir(port, 'POST', '/api/herramientas/aprobar', { cuerpo: { id: 'tiempo', huella: huella(e.dir) }, cab: casa });
  assert.equal(no.estado, 403);
  aprobar({ trabajo: e.trabajo, env: e.env, id: 'tiempo' });
  assert.equal((await pedir(port, 'POST', '/api/herramientas/desactivar', { cuerpo: { id: 'tiempo' }, cab: casa })).estado, 200);
});

test('cada sesión remota nueva rehace el MCP antes de lanzar Claude (y un fallo ahí no la impide)', () => {
  const e = conHerramienta();
  const orden = [];
  const { remoto, lanzados } = nuevo(e, { prepararMcp: () => { orden.push('mcp'); fs.writeFileSync(path.join(e.trabajo, ARCHIVO_MCP), '{}'); } });
  const lanzar = remoto.lanzar;
  remoto.lanzar = (...a) => { orden.push('claude'); return lanzar(...a); };
  remoto.abrir('A');
  assert.deepEqual(orden, ['mcp', 'claude']);
  assert.ok(lanzados[0].args.includes('--mcp-config'));
  remoto.prepararMcp = () => { throw new Error('roto'); };
  remoto.abrir('B');
  assert.equal(lanzados.length, 2);
  remoto.cerrarTodas();
});
