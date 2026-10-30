// Pruebas de las sesiones remotas (Claude Code en terminal): validación de proyecto, límites, argumentos y reglas,
// entorno, pantalla en vivo, teclas, tamaño, registro y cierre. Con un `claude` falso: no se abre nada real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { comillas, tamanoValido } from '../panel/lib/pty.mjs';
import { entorno, nuevo } from './apoyo/remoto.mjs';
import { Registro } from '../panel/lib/registro.mjs';
import { ajustesTerminal, entornoRemoto, extraerUrls, marcarConfianza } from '../panel/lib/remoto.mjs';

// Salida real de `claude --remote-control` (2.1.308) en la terminal, recortada.
const SALIDA = '\x1b]8;id=fl1gej;https://claude.ai/code/session_013NNAw9kQjK9W2UWAKCPdzG?from=cli\x07/rc active\x1b]8;;\x07\r\n'
  + '/remote-control is active · Continue here, on your phone, or at https://claude.ai/code/session_013NNAw9kQjK9W2UWAKCPdzG\r\n';

const espera = () => new Promise((r) => setImmediate(r));

/** Respuesta HTTP de mentira para el SSE. */
function resFalsa() {
  const r = Object.assign(new EventEmitter(), { escrito: '', terminado: false, cabeceras: null });
  r.writeHead = (codigo, cab) => { r.cabeceras = { codigo, ...cab }; };
  r.write = (d) => { r.escrito += d; return true; };
  r.end = () => { r.terminado = true; r.emit('close'); };
  return r;
}
const eventos = (texto) => [...texto.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map(([, tipo, datos]) => [tipo, JSON.parse(datos)]);

test('extraerUrls: la URL de la sesión en la salida real de la terminal', () => {
  assert.equal(extraerUrls(SALIDA).sesion, 'https://claude.ai/code/session_013NNAw9kQjK9W2UWAKCPdzG');
  assert.deepEqual(extraerUrls('nada'), { sesion: null, entorno: null });
  assert.equal(extraerUrls('https://claude.ai.evil.com/code/session_x').sesion, null);
});

test('pty: comillas de shell y tamaños válidos', () => {
  assert.equal(comillas("a'b; rm -rf /"), `'a'\\''b; rm -rf /'`);
  assert.ok(tamanoValido(120, 36));
  for (const [c, f] of [[10, 36], [120, 2], [1e6, 36], ['120', 36], [12.5, 36]]) assert.ok(!tamanoValido(c, f), `${c}x${f}`);
});

test('validación de proyecto: solo carpetas de TRABAJO_DIR/proyectos', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  for (const malo of ['..', '../fuera', '/etc', 'A/../B', 'No-existe', 'Bóveda', '', null, 42, '.oculto']) {
    assert.throws(() => remoto.abrir(malo), (err) => err.codigo === 404, String(malo));
  }
  assert.equal(lanzados.length, 0);
});

test('abrir: Claude con Remote Control, permisos manuales, reglas deny y entorno limpio', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  remoto.abrir('A', { quien: 'iPhone', cols: 100, filas: 30 });
  const [h] = lanzados;
  assert.equal(h.opciones.cwd, path.join(e.trabajo, 'proyectos', 'A'));
  assert.deepEqual([h.opciones.cols, h.opciones.filas], [100, 30]);
  assert.deepEqual(h.args.slice(0, 4), ['--remote-control', 'Nullraptor · A', '--permission-mode', 'manual']);
  assert.equal(h.args[4], '--settings');
  const { deny } = JSON.parse(h.args[5]).permissions;
  for (const regla of ['Read(//cofre/**)', `Read(/${path.join(e.base, '.nullraptor')}/**)`, `Read(/${path.join(e.configDir, '.credentials.json')})`, `Edit(/${path.join(e.trabajo, 'registros')}/**)`]) {
    assert.ok(deny.includes(regla), regla);
  }
  const env = h.opciones.env;
  assert.equal(env.AGENTE_CLAVE, undefined);
  assert.equal(env.CLAUDE_CODE_CHILD_SESSION, undefined);
  assert.equal(env.CLAUDECODE, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'tok'); // sin sesión de claude.ai guardada, se usa el token
  assert.equal(env.GITHUB_TOKEN, 'gh');
  assert.equal(env.BOVEDA_DIR, e.memoria);
  assert.equal(env.TRABAJO_DIR, e.trabajo);
  assert.equal(remoto.lista()[0].quien, 'iPhone');
  assert.ok(!h.args.includes('--mcp-config')); // sin archivo MCP preparado, no se pasa
});

test('abrir: el MCP preparado al arrancar (Ruflo) llega a la sesión desde fuera del proyecto', () => {
  const e = entorno();
  fs.writeFileSync(path.join(e.trabajo, '.mcp-agente.json'), '{"mcpServers":{}}');
  const { remoto, lanzados } = nuevo(e);
  remoto.abrir('A');
  const i = lanzados[0].args.indexOf('--mcp-config');
  assert.equal(lanzados[0].args[i + 1], path.join(e.trabajo, '.mcp-agente.json'));
  assert.ok(!fs.existsSync(path.join(e.trabajo, 'proyectos', 'A', '.mcp.json')));
});

test('pantalla: URL y estado, repintado al conectarse, datos en vivo y fin', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  const { id } = remoto.abrir('A');
  const [h] = lanzados;
  h.stdout.write('hola ');
  await espera();
  assert.equal(remoto.lista()[0].estado, 'conectando');
  const res = resFalsa();
  remoto.suscribir(id, res, 'yo');
  assert.equal(res.cabeceras['Content-Type'], 'text/event-stream; charset=utf-8');
  h.stdout.write(SALIDA);
  await espera();
  const [s] = remoto.lista();
  assert.equal(s.estado, 'conectada');
  assert.match(s.url, /session_013NNAw9kQjK9W2UWAKCPdzG$/);
  h.emit('exit', 0, null);
  const ev = eventos(res.escrito);
  assert.deepEqual(ev[0], ['pantalla', 'hola ']);
  assert.deepEqual(ev[1], ['datos', SALIDA]);
  assert.equal(ev[2][0], 'fin');
  assert.ok(res.terminado);
  assert.throws(() => remoto.suscribir(id, resFalsa()), (err) => err.codigo === 404);
});

test('teclas y tamaño: van al proceso; se validan', async () => {
  const e = entorno();
  const { remoto, lanzados, tamanos } = nuevo(e);
  const { id } = remoto.abrir('A');
  remoto.escribir(id, 'hola\r', 'yo');
  assert.equal(lanzados[0].stdin.read(), 'hola\r');
  for (const malo of ['', null, 5, 'x'.repeat(70_000)]) assert.throws(() => remoto.escribir(id, malo), (err) => err.codigo === 400);
  await remoto.tamano(id, 90, 25);
  assert.deepEqual(tamanos, [['/dev/pts/7', 90, 25]]);
  await assert.rejects(remoto.tamano(id, 5, 25), (err) => err.codigo === 400);
  await assert.rejects(remoto.tamano('no-existe', 90, 25), (err) => err.codigo === 404);
});

test('registro: apertura, entrada, salida y cierre en el volumen', async () => {
  const e = entorno();
  const registro = new Registro({ carpeta: path.join(e.trabajo, 'registros') });
  const { remoto, lanzados } = nuevo(e, { registro });
  const { id } = remoto.abrir('A', { quien: 'iPhone' });
  remoto.escribir(id, 'ls\r', 'iPhone');
  lanzados[0].stdout.write('respuesta');
  await espera();
  remoto.cerrar(id);
  await espera();
  const [archivo] = fs.readdirSync(path.join(e.trabajo, 'registros', 'terminal'));
  assert.match(archivo, /-A-[0-9a-f]{8}\.jsonl$/);
  const lineas = fs.readFileSync(path.join(e.trabajo, 'registros', 'terminal', archivo), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lineas.map((l) => l.tipo), ['apertura', 'entrada', 'escribe', 'salida', 'cierre']);
  assert.equal(lineas[0].quien, 'iPhone');
  assert.equal(lineas[1].datos, 'ls\r');
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
  assert.equal(marcarConfianza(e.configDir, path.join(e.trabajo, 'proyectos', 'A')), false);
});

test('entornoRemoto y ajustesTerminal: token fuera con sesión guardada; reglas sobre rutas absolutas', () => {
  const e = entorno();
  assert.equal(entornoRemoto({ CLAUDE_CODE_OAUTH_TOKEN: 't' }, { ...e }).CLAUDE_CODE_OAUTH_TOKEN, 't');
  fs.writeFileSync(path.join(e.configDir, '.credentials.json'), '{}');
  assert.equal(entornoRemoto({ CLAUDE_CODE_OAUTH_TOKEN: 't', AGENTE_CLAVE: 'k' }, { ...e }).CLAUDE_CODE_OAUTH_TOKEN, undefined);
  const { deny } = ajustesTerminal({ env: { HOME: '/estado/home' }, configDir: '/estado/home/.claude', trabajo: '/estado/trabajo' }).permissions;
  assert.ok(deny.includes('Edit(//estado/home/.nullraptor/**)'));
  assert.ok(!deny.some((r) => r.startsWith('Write('))); // Claude avisa de que Write nunca coincide
  assert.ok(deny.includes('Read(//estado/home/.claude/.credentials.json)'));
});

test('límites: una por proyecto y máximo 3 en total; cerrar deja hueco', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  const a = remoto.abrir('A');
  assert.throws(() => remoto.abrir('A'), (err) => err.codigo === 409);
  remoto.abrir('B');
  remoto.abrir('C');
  assert.throws(() => remoto.abrir('D'), (err) => err.codigo === 429);
  assert.equal(lanzados.length, 3);
  assert.ok(remoto.cerrar(a.id));
  assert.deepEqual(lanzados[0].señales, ['SIGTERM']);
  assert.equal(remoto.lista().length, 2);
  assert.equal(remoto.abrir('D').proyecto, 'D');
  assert.equal(remoto.cerrar('no-existe'), false);
});

test('una sesión que termina sola deja hueco y conserva el motivo', () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e, { maxTotal: 1 });
  remoto.abrir('A');
  lanzados[0].stdout.write('\x1b[31mError: algo falló\x1b[0m\r\n');
  lanzados[0].emit('exit', 1, null);
  const [s] = remoto.lista();
  assert.equal(s.estado, 'terminada');
  assert.equal(s.motivo, 'Error: algo falló');
  assert.equal(remoto.abrir('A').estado, 'conectando');
  assert.equal(remoto.lista().length, 1);
});

test('cierre automático tras el tiempo máximo', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e, { maxMs: 20 });
  remoto.abrir('A');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(lanzados[0].señales, ['SIGTERM']);
  assert.match(remoto.lista()[0].motivo, /4 h/);
});

test('cerrarTodas: mueren todas al parar el panel y se espera a que terminen', async () => {
  const e = entorno();
  const { remoto, lanzados } = nuevo(e);
  remoto.abrir('A');
  remoto.abrir('B');
  const fin = remoto.cerrarTodas();
  assert.deepEqual(lanzados.map((h) => h.señales), [['SIGTERM'], ['SIGTERM']]);
  assert.ok(remoto.lista().every((s) => s.estado === 'terminada'));
  await fin;
});
