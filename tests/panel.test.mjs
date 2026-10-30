// Pruebas del panel web: seguridad (rutas, Host, CSRF), bóveda, chats guardados y API contra carpetas temporales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buscar, enlaces, frontmatter, leerNota, listarNotas, rutaSegura } from '../panel/lib/boveda.mjs';
import { Chats } from '../panel/lib/chats.mjs';
import { crearServidor, escrituraPermitida, hostPermitido } from '../panel/servidor.mjs';
import { BOVEDA, listarProyectos, rutaProyecto } from '../panel/lib/trabajo.mjs';
import { AGENTE_REPO, opcionesDelMenu } from '../scripts/menu.mjs';
import { crearVista, limpiarCookies } from '../panel/lib/vista.mjs';

function entorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-'));
  const memoria = path.join(base, 'memoria');
  const trabajo = path.join(base, 'trabajo');
  fs.mkdirSync(path.join(memoria, 'Proyectos'), { recursive: true });
  fs.mkdirSync(path.join(memoria, '.git'), { recursive: true });
  fs.writeFileSync(path.join(memoria, '.git', 'secreto.md'), 'no');
  fs.writeFileSync(path.join(memoria, '00-Inicio.md'), '---\ntipo: indice\n---\n# Inicio\nVer [[Demo]] y [[Falta|otra]].\n');
  fs.writeFileSync(path.join(memoria, 'Proyectos', 'Demo.md'), '---\ntipo: proyecto\nrepo: https://github.com/x/Demo\n---\n# Demo\nRaptor veloz.\n');
  fs.mkdirSync(path.join(trabajo, 'proyectos', 'Demo', 'tareas'), { recursive: true });
  fs.writeFileSync(path.join(trabajo, 'proyectos', 'Demo', 'tareas', 'T1.md'), '# Primera tarea\nId: T1\n');
  fs.writeFileSync(path.join(base, 'fuera.md'), 'fuera');
  return { base, memoria, trabajo };
}

test('rutaSegura: no sale de la bóveda ni entra en .git; solo .md', () => {
  const { memoria } = entorno();
  assert.ok(rutaSegura(memoria, 'Proyectos/Demo.md'));
  for (const mala of ['../fuera.md', '/etc/passwd', '.git/secreto.md', 'Proyectos/../../fuera.md', 'Proyectos', '00-Inicio.md\0', '', null]) {
    assert.equal(rutaSegura(memoria, mala), null, String(mala));
  }
});

test('rutaSegura: un enlace simbólico hacia fuera no se sigue', (t) => {
  const { base, memoria } = entorno();
  try { fs.symlinkSync(path.join(base, 'fuera.md'), path.join(memoria, 'enlace.md')); } catch { t.skip('sin enlaces simbólicos'); return; }
  assert.equal(rutaSegura(memoria, 'enlace.md'), null);
});

test('frontmatter, enlaces y retroenlaces', () => {
  const { memoria } = entorno();
  assert.deepEqual(frontmatter('---\ntipo: x\n---\ncuerpo').datos, { tipo: 'x' });
  assert.deepEqual(enlaces('[[A]] [[B|alias]] [[A#sec]]'), ['A', 'B']);
  const nota = leerNota(memoria, 'Proyectos/Demo.md');
  assert.equal(nota.datos.tipo, 'proyecto');
  assert.deepEqual(nota.retroenlaces, ['00-Inicio.md']);
  assert.equal(listarNotas(memoria).length, 2);
});

test('buscar: sin acentos ni mayúsculas, fuera del frontmatter', () => {
  const { memoria } = entorno();
  assert.equal(buscar(memoria, 'RAPTOR')[0].ruta, 'Proyectos/Demo.md');
  assert.equal(buscar(memoria, 'proyecto').length, 0); // solo aparece en el frontmatter
  assert.deepEqual(buscar(memoria, 'a'), []);
});

test('hostPermitido y escrituraPermitida (DNS rebinding y CSRF)', () => {
  assert.ok(hostPermitido('localhost:4321'));
  assert.ok(hostPermitido('127.0.0.1'));
  assert.ok(!hostPermitido('evil.com'));
  assert.ok(!hostPermitido('localhost.evil.com'));
  const req = (headers) => ({ headers: { host: 'localhost:4321', ...headers } });
  assert.ok(escrituraPermitida(req({ 'x-nullraptor': '1' })));
  assert.ok(escrituraPermitida(req({ 'x-nullraptor': '1', origin: 'http://localhost:4321' })));
  assert.ok(!escrituraPermitida(req({})));
  assert.ok(!escrituraPermitida(req({ 'x-nullraptor': '1', origin: 'http://evil.com' })));
  assert.ok(!escrituraPermitida(req({ 'x-nullraptor': '1', origin: 'http://localhost:9999' })));
});

test('chats guardados: se leen por nombre de archivo, nunca por ruta', () => {
  const { trabajo, memoria } = entorno();
  const chats = new Chats({ trabajo, memoria });
  fs.mkdirSync(chats.carpeta, { recursive: true });
  fs.writeFileSync(path.join(chats.carpeta, 'Demo-2026-10-29T10-00-00.md'), '**Dano:** hola\n\n**Claude:** uno\n\ndos\n\n**Codex:** tres\n\n');
  const leido = chats.leerGuardado('Demo-2026-10-29T10-00-00.md');
  assert.deepEqual(leido.mensajes, [{ quien: 'dano', texto: 'hola' }, { quien: 'claude', texto: 'uno\n\ndos' }, { quien: 'codex', texto: 'tres' }]);
  assert.equal(chats.leerGuardado('../memoria/00-Inicio.md'), null);
  assert.equal(chats.guardados()[0].proyecto, 'Demo');
});

function pedir(puerto, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, cab: res.headers, datos: d && res.headers['content-type']?.includes('json') ? JSON.parse(d) : d }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    r.end();
  });
}

test('API del panel', async (t) => {
  const { memoria, trabajo } = entorno();
  execFileSync('git', ['init', '-q'], { cwd: path.join(trabajo, 'proyectos', 'Demo') });
  const servidor = crearServidor({ trabajo, memoria });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();

  const resumen = await pedir(port, 'GET', '/api/resumen');
  assert.equal(resumen.estado, 200);
  assert.equal(resumen.datos.boveda.notas, 2);
  const demo = resumen.datos.proyectos.find((p) => p.nombre === 'Demo');
  assert.equal(demo.local, true);
  assert.equal(demo.repo, 'https://github.com/x/Demo');
  assert.equal(demo.flujo.tareas, 1);

  assert.equal((await pedir(port, 'GET', '/api/proyecto?nombre=Demo')).datos.flujo.tareas[0].id, 'T1');
  assert.equal((await pedir(port, 'GET', '/api/proyecto?nombre=..')).estado, 404);
  assert.equal((await pedir(port, 'GET', '/api/boveda/nota?ruta=..%2Ffuera.md')).estado, 404);
  assert.equal((await pedir(port, 'GET', '/api/boveda/nota?ruta=00-Inicio.md')).datos.nombre, '00-Inicio');
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: { host: 'evil.com' } })).estado, 421);

  // Escrituras: sin cabecera, 403; proyecto inexistente, 404; JSON roto, 400; cuerpo enorme, 413.
  assert.equal((await pedir(port, 'POST', '/api/chats', { cuerpo: { proyecto: 'Demo' } })).estado, 403);
  const cab = { 'x-nullraptor': '1' };
  assert.equal((await pedir(port, 'POST', '/api/chats', { cuerpo: { proyecto: '../memoria' }, cab })).estado, 404);
  assert.equal((await pedir(port, 'POST', '/api/chats', { cuerpo: '{roto', cab })).estado, 400);
  assert.equal((await pedir(port, 'POST', '/api/chats', { cuerpo: { proyecto: 'x'.repeat(70_000) }, cab }).catch(() => ({ estado: 413 }))).estado, 413);

  // Chat abierto (sin enviar mensajes: no se llama a ninguna IA).
  const creado = await pedir(port, 'POST', '/api/chats', { cuerpo: { proyecto: 'Demo' }, cab });
  assert.equal(creado.estado, 201);
  assert.equal((await pedir(port, 'GET', '/api/chats')).datos.abiertos[0].proyecto, 'Demo');
  assert.equal((await pedir(port, 'POST', `/api/chats/${creado.datos.id}/mensajes`, { cuerpo: { texto: '   ' }, cab })).estado, 400);
  assert.equal((await pedir(port, 'POST', `/api/chats/${creado.datos.id}/cerrar`, { cab })).estado, 200);
  assert.equal((await pedir(port, 'POST', `/api/chats/${creado.datos.id}/cerrar`, { cab })).estado, 404);
});

test('Nullraptor y la bóveda salen primero (menú y panel); la bóveda abre la memoria', () => {
  const { memoria, trabajo } = entorno();
  const menu = opcionesDelMenu(memoria);
  assert.deepEqual(menu.map((p) => p.nombre), ['Nullraptor', 'Bóveda', 'Demo']);
  assert.equal(menu[0].repo, AGENTE_REPO);
  fs.mkdirSync(path.join(trabajo, 'proyectos', 'Nullraptor'));
  const lista = listarProyectos(trabajo, memoria);
  assert.deepEqual(lista.map((p) => p.nombre), ['Nullraptor', 'Bóveda', 'Demo']);
  assert.ok(lista[1].local);
  assert.equal(rutaProyecto(trabajo, BOVEDA, memoria), memoria);
  assert.equal(rutaProyecto(trabajo, BOVEDA), null); // sin bóveda configurada
  assert.deepEqual(listarProyectos(trabajo, null).map((p) => p.nombre), ['Nullraptor', 'Demo']);
});

test('vista previa: /vista/ se reenvía al servidor de desarrollo sin las cookies del panel', async (t) => {
  const { memoria, trabajo } = entorno();
  const visto = [];
  const web = http.createServer((req, res) => {
    visto.push({ metodo: req.method, url: req.url, host: req.headers.host, cookie: req.headers.cookie, origin: req.headers.origin });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  const vista = crearVista({ puerto: web.address().port });
  const servidor = crearServidor({ trabajo, memoria, vista });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => { servidor.close(); web.close(); });
  const { port } = servidor.address();

  const r = await pedir(port, 'GET', '/vista/libros?x=1', { cab: { cookie: 'nr_sesion=secreto; carrito=3' } });
  assert.equal(r.estado, 200);
  assert.deepEqual(visto[0], { metodo: 'GET', url: '/vista/libros?x=1', host: `127.0.0.1:${vista.puerto}`, cookie: 'carrito=3', origin: undefined });
  // Escrituras: la web no manda X-Nullraptor; vale el mismo origen y se rechaza otro.
  assert.equal((await pedir(port, 'POST', '/vista/accion', { cab: { origin: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}` } })).estado, 200);
  assert.equal(visto[1].origin, `http://127.0.0.1:${vista.puerto}`);
  assert.equal((await pedir(port, 'POST', '/vista/accion', { cab: { origin: 'https://evil.com' } })).estado, 403);
  assert.equal(visto.length, 2);
  assert.equal(limpiarCookies('nr_sesion=a; __Host-nr_pk=b'), null);

  // Rutas fijas desde una página de la vista: imagen reenviada con /vista delante; página, redirigida; API, nunca.
  const desde = { referer: `http://127.0.0.1:${port}/vista/libros`, host: `127.0.0.1:${port}` };
  assert.equal((await pedir(port, 'GET', '/catalogo/a.jpg', { cab: { ...desde, 'sec-fetch-dest': 'image' } })).estado, 200);
  assert.equal(visto[2].url, '/vista/catalogo/a.jpg');
  const pagina = await pedir(port, 'GET', '/carrito?x=1', { cab: { ...desde, 'sec-fetch-dest': 'document' } });
  assert.equal(pagina.estado, 302);
  assert.equal(pagina.cab.location, '/vista/carrito?x=1');
  assert.equal((await pedir(port, 'GET', '/api/resumen', { cab: desde })).estado, 200);
  await pedir(port, 'GET', '/catalogo/a.jpg', { cab: { ...desde, referer: 'https://evil.com/vista/' } }); // otro sitio: no
  assert.equal(visto.length, 3);

  await new Promise((r) => { web.close(r); web.closeAllConnections(); });
  assert.equal((await pedir(port, 'GET', '/vista/')).estado, 502);
});
