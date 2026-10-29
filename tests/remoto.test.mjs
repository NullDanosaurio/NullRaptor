// Pruebas de las sesiones remotas del panel: validación de proyecto, límites, URL, confianza y API.
// Con un `claude` falso: no se abre ninguna sesión real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { Remoto, entornoRemoto, extraerUrls, marcarConfianza } from '../panel/lib/remoto.mjs';
import { crearServidor } from '../panel/servidor.mjs';

// Salida real de `claude remote-control` (2.1.308), recortada.
const SALIDA = 'Enable Remote Control? (y/n) \n·|· Connecting · NullRaptor · main\n\x1b[1A\x1b[J·✔︎· Connected · NullRaptor · main\n'
  + '    \x1b]8;;https://claude.ai/code/session_013NNAwC4Nn3KwgNYEzG11vb?from=cli\x07Demo\x1b]8;;\x07\n'
  + 'Continue coding in the Claude mobile app or https://claude.ai/code?environment=env_01QrZjrwC8UJb9L5DSZ2fKRP\n';

function entorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'remoto-'));
  const trabajo = path.join(base, 'trabajo');
  for (const p of ['A', 'B', 'C', 'D']) fs.mkdirSync(path.join(trabajo, 'proyectos', p), { recursive: true });
  fs.writeFileSync(path.join(base, 'fuera'), 'x');
  const configDir = path.join(base, 'claude');
  fs.mkdirSync(configDir);
  return { base, trabajo, configDir, memoria: path.join(base, 'memoria') };
}

function falso() {
  const lanzados = [];
  const lanzar = (args, opciones) => {
    const hijo = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), exitCode: null, signalCode: null, args, opciones, señales: [] });
    hijo.stdin.setEncoding('utf8');
    hijo.kill = (s) => { hijo.señales.push(s); hijo.signalCode = s; setImmediate(() => hijo.emit('exit', null, s)); return true; };
    lanzados.push(hijo);
    return hijo;
  };
  return { lanzar, lanzados };
}

const nuevo = (e, extra = {}) => {
  const f = falso();
  const env = { AGENTE_CLAVE: 'secreta', CLAUDE_CODE_OAUTH_TOKEN: 'tok', GITHUB_TOKEN: 'gh', PATH: process.env.PATH };
  return { ...f, remoto: new Remoto({ trabajo: e.trabajo, memoria: e.memoria, env, lanzar: f.lanzar, configDir: e.configDir, ...extra }) };
};
const espera = () => new Promise((r) => setImmediate(r));

test('extraerUrls: sesión y entorno de la salida real', () => {
  assert.deepEqual(extraerUrls(SALIDA), {
    sesion: 'https://claude.ai/code/session_013NNAwC4Nn3KwgNYEzG11vb?from=cli',
    entorno: 'https://claude.ai/code?environment=env_01QrZjrwC8UJb9L5DSZ2fKRP',
  });
  assert.deepEqual(extraerUrls('nada'), { sesion: null, entorno: null });
  assert.equal(extraerUrls('https://claude.ai.evil.com/code/session_x').sesion, null);
});

test('validación de proyecto: solo carpetas de TRABAJO_DIR/proyectos', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  for (const malo of ['..', '../fuera', '/etc', 'A/../B', 'No-existe', 'Bóveda', '', null, 42, '.oculto']) {
    assert.throws(() => remoto.abrir(malo), (err) => err.codigo === 404, String(malo));
  }
  assert.equal(lanzados.length, 0);
});

test('abrir: cwd del proyecto, --capacity 1, entorno sin AGENTE_CLAVE, URL y estado', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  const s = remoto.abrir('A');
  assert.equal(s.estado, 'conectando');
  const [h] = lanzados;
  assert.equal(h.opciones.cwd, path.join(e.trabajo, 'proyectos', 'A'));
  assert.deepEqual(h.args, ['remote-control', '--name', 'Nullraptor · A', '--capacity', '1']);
  assert.ok(!h.args.includes('--permission-mode')); // permisos por defecto
  assert.equal(h.opciones.env.AGENTE_CLAVE, undefined);
  assert.equal(h.opciones.env.GITHUB_TOKEN, 'gh');
  assert.equal(h.opciones.env.BOVEDA_DIR, e.memoria);
  assert.equal(h.opciones.env.TRABAJO_DIR, e.trabajo);
  h.stdout.write(SALIDA);
  await espera();
  assert.equal(h.stdin.read(), 'y\n'); // contesta la pregunta de la primera vez
  const [l] = remoto.lista();
  assert.equal(l.estado, 'conectada');
  assert.match(l.url, /\/code\/session_/);
  assert.match(l.entorno, /environment=env_/);
  assert.equal(l.hijo, undefined); // la lista no expone el proceso
});

test('confianza: se marca la carpeta en .claude.json sin tocar lo demás', () => {
  const e = entorno();
  const archivo = path.join(e.configDir, '.claude.json');
  fs.writeFileSync(archivo, JSON.stringify({ otra: 1, projects: { '/x': { hasTrustDialogAccepted: true, extra: 2 } } }));
  const { remoto } = nuevo(e);
  remoto.abrir('A');
  const c = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  assert.equal(c.otra, 1);
  assert.deepEqual(c.projects['/x'], { hasTrustDialogAccepted: true, extra: 2 });
  assert.equal(c.projects[path.join(e.trabajo, 'proyectos', 'A')].hasTrustDialogAccepted, true);
  assert.equal(marcarConfianza(e.configDir, path.join(e.trabajo, 'proyectos', 'A')), false); // ya estaba
});

test('entornoRemoto: con sesión de claude.ai guardada se quita el token', () => {
  const e = entorno();
  assert.equal(entornoRemoto({ CLAUDE_CODE_OAUTH_TOKEN: 't' }, { ...e }).CLAUDE_CODE_OAUTH_TOKEN, 't');
  fs.writeFileSync(path.join(e.configDir, '.credentials.json'), '{}');
  assert.equal(entornoRemoto({ CLAUDE_CODE_OAUTH_TOKEN: 't', AGENTE_CLAVE: 'k' }, { ...e }).CLAUDE_CODE_OAUTH_TOKEN, undefined);
});

test('límites: una por proyecto y máximo 3 en total', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  const a = remoto.abrir('A');
  assert.throws(() => remoto.abrir('A'), (err) => err.codigo === 409);
  remoto.abrir('B');
  remoto.abrir('C');
  assert.throws(() => remoto.abrir('D'), (err) => err.codigo === 429);
  assert.equal(lanzados.length, 3);
  // Al cerrar una, hay hueco otra vez y la cerrada desaparece de la lista.
  assert.ok(remoto.cerrar(a.id));
  assert.deepEqual(lanzados[0].señales, ['SIGINT']);
  assert.equal(remoto.lista().length, 2);
  assert.equal(remoto.abrir('D').proyecto, 'D');
  assert.equal(remoto.cerrar('no-existe'), false);
});

test('una sesión que termina sola deja hueco y conserva el motivo', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e, { maxTotal: 1 });
  remoto.abrir('A');
  lanzados[0].stderr.write('Error: Workspace not trusted.\n');
  lanzados[0].emit('exit', 1, null);
  const [s] = remoto.lista();
  assert.equal(s.estado, 'terminada');
  assert.equal(s.motivo, 'Error: Workspace not trusted.');
  assert.equal(remoto.abrir('A').estado, 'conectando'); // no cuenta para los límites y se sustituye
  assert.equal(remoto.lista().length, 1);
});

test('cierre automático tras el tiempo máximo', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e, { maxMs: 20 });
  remoto.abrir('A');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(lanzados[0].señales, ['SIGINT']);
  const [s] = remoto.lista();
  assert.equal(s.estado, 'terminada');
  assert.match(s.motivo, /4 h/);
});

test('cerrarTodas: mueren todas al parar el panel y se espera a que terminen', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  remoto.abrir('A');
  remoto.abrir('B');
  const fin = remoto.cerrarTodas();
  assert.deepEqual(lanzados.map((h) => h.señales), [['SIGINT'], ['SIGINT']]);
  assert.ok(remoto.lista().every((s) => s.estado === 'terminada'));
  await fin; // el falso emite 'exit' al recibir la señal
});

test('error antes de conectar: se corta enseguida, deja hueco y explica la carpeta ocupada', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e, { maxTotal: 1 });
  remoto.abrir('A');
  lanzados[0].stderr.write('\x1b[31mError: This folder is already served by a terminal `claude remote-control` on this device. Stop it first.\x1b[0m\nExiting in about 56 seconds.\n');
  assert.deepEqual(lanzados[0].señales, ['SIGINT']);
  const [s] = remoto.lista();
  assert.equal(s.estado, 'terminada');
  assert.match(s.motivo, /espera un minuto/);
  assert.equal(remoto.abrir('B').estado, 'conectando');
});

function pedir(puerto, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(JSON.stringify(cuerpo));
    r.end();
  });
}

test('API /api/remoto: protección, validación y límites', async (t) => {
  const e = entorno();
  const { remoto } = nuevo(e, { maxTotal: 1 });
  const servidor = crearServidor({ trabajo: e.trabajo, memoria: null, remoto });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => { remoto.cerrarTodas(); servidor.close(); });
  const { port } = servidor.address();
  const cab = { 'x-nullraptor': '1' };

  assert.equal((await pedir(port, 'GET', '/api/remoto', { cab: { host: 'evil.com' } })).estado, 421);
  assert.equal((await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'A' } })).estado, 403);
  assert.equal((await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: '../fuera' }, cab })).estado, 404);
  const abierta = await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'A' }, cab });
  assert.equal(abierta.estado, 201);
  assert.equal((await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'A' }, cab })).estado, 409);
  assert.equal((await pedir(port, 'POST', '/api/remoto/abrir', { cuerpo: { proyecto: 'B' }, cab })).estado, 429);
  const lista = await pedir(port, 'GET', '/api/remoto');
  assert.equal(lista.datos.sesiones[0].proyecto, 'A');
  assert.equal(lista.datos.maxTotal, 1);
  assert.equal((await pedir(port, 'GET', '/api/resumen')).datos.remoto.length, 1);
  assert.equal((await pedir(port, 'POST', `/api/remoto/${abierta.datos.id}/cerrar`)).estado, 403);
  assert.equal((await pedir(port, 'POST', `/api/remoto/${abierta.datos.id}/cerrar`, { cab })).estado, 200);
  assert.equal((await pedir(port, 'POST', `/api/remoto/${abierta.datos.id}/cerrar`, { cab })).estado, 404);
});
