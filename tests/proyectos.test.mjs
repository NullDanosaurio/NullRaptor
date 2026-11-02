// Proyectos desde el panel: descargar uno de la bóveda, clonar por URL y crear uno nuevo. GitHub se sustituye por
// repositorios locales (las URL https://github.test/<x>.git se traducen a carpetas bare).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { gitAsincrono, nombreDeUrl, Proyectos, urlValida } from '../panel/lib/proyectos.mjs';
import { crearServidor } from '../panel/servidor.mjs';
import { crearAcceso } from '../panel/lib/acceso.mjs';

const ENV_GIT = { ...process.env, GIT_AUTHOR_NAME: 'Prueba', GIT_AUTHOR_EMAIL: 'p@p', GIT_COMMITTER_NAME: 'Prueba', GIT_COMMITTER_EMAIL: 'p@p', GIT_CONFIG_GLOBAL: '/dev/null' };
const g = (args, cwd) => execFileSync('git', args, { cwd, env: ENV_GIT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function entorno() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'proyectos-'));
  const remotos = path.join(base, 'github');
  fs.mkdirSync(remotos);
  const repo = (nombre) => {
    const bare = path.join(remotos, `${nombre}.git`);
    g(['init', '-q', '--bare', '-b', 'main', bare]);
    const tmp = path.join(base, `tmp-${nombre}`);
    g(['clone', '-q', bare, tmp]);
    fs.writeFileSync(path.join(tmp, 'LEEME.md'), `# ${nombre}\n`);
    g(['add', '.'], tmp);
    g(['commit', '-qm', 'inicio'], tmp);
    g(['push', '-q', 'origin', 'HEAD:main'], tmp);
    return `https://github.test/${nombre}.git`;
  };
  // Bóveda: clon de un bare, para que el push de la nota funcione.
  const memoriaRemota = path.join(remotos, 'memoria.git');
  g(['init', '-q', '--bare', '-b', 'main', memoriaRemota]);
  const memoria = path.join(base, 'memoria');
  g(['clone', '-q', memoriaRemota, memoria]);
  fs.mkdirSync(path.join(memoria, 'Proyectos'));
  fs.writeFileSync(path.join(memoria, 'Proyectos', 'Conocido.md'), `---\nrepo: ${repo('Conocido')}\n---\n# Conocido\n`);
  g(['add', '.'], memoria);
  g(['commit', '-qm', 'inicio'], memoria);
  g(['push', '-q', 'origin', 'HEAD:main'], memoria);
  const real = gitAsincrono(ENV_GIT);
  const git = (args, cwd) => real(args.map((a) => a.replace(/^https:\/\/github\.test\/(.+)$/, (_, r) => path.join(remotos, r))), cwd);
  return { base, trabajo: path.join(base, 'trabajo'), memoria, memoriaRemota, repo, git };
}

test('urlValida y nombreDeUrl', () => {
  assert.equal(urlValida('https://github.com/a/b.git'), true);
  for (const u of ['http://github.com/a/b', 'git@github.com:a/b.git', 'file:///etc', 'https://yo:clave@github.com/a/b', 'https://github.com', '', null]) assert.equal(urlValida(u), false, String(u));
  assert.equal(nombreDeUrl('https://github.com/a/MiRepo.git'), 'MiRepo');
  assert.equal(nombreDeUrl('https://github.com/a/Otro/'), 'Otro');
});

test('descargar un proyecto de la bóveda: una vez; desconocido, 404', async () => {
  const e = entorno();
  const p = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: {}, git: e.git });
  assert.deepEqual(await p.descargar('Conocido'), { nombre: 'Conocido' });
  assert.ok(fs.existsSync(path.join(e.trabajo, 'proyectos', 'Conocido', 'LEEME.md')));
  await assert.rejects(() => p.descargar('Conocido'), (x) => x.codigo === 409);
  await assert.rejects(() => p.descargar('Nada'), (x) => x.codigo === 404);
});

test('clonar por URL: copia en el equipo, nota en la bóveda (subida); si falla, sin medias copias', async () => {
  const e = entorno();
  const p = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: {}, git: e.git });
  const url = e.repo('Ajeno');
  const r = await p.clonar(url);
  assert.deepEqual(r, { nombre: 'Ajeno', nota: 'Proyectos/Ajeno.md', avisos: [] });
  assert.match(fs.readFileSync(path.join(e.memoria, 'Proyectos', 'Ajeno.md'), 'utf8'), new RegExp(`repo: ${url.replace(/\./g, '\\.')}`));
  assert.match(g(['log', '--oneline', '-1', 'main'], e.memoriaRemota), /Proyecto nuevo: Ajeno/);
  await assert.rejects(() => p.clonar('git@github.com:a/b.git'), (x) => x.codigo === 400);
  await assert.rejects(() => p.clonar(url, '../fuera'), (x) => x.codigo === 400);
  await assert.rejects(() => p.clonar('https://github.test/NoExiste.git'), (x) => x.codigo === 502);
  assert.equal(fs.existsSync(path.join(e.trabajo, 'proyectos', 'NoExiste')), false);
});

test('crear: hace falta GITHUB_TOKEN; con él, repositorio, nota y copia', async () => {
  const e = entorno();
  const sin = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: {}, git: e.git });
  await assert.rejects(() => sin.crear('Nuevo'), (x) => x.codigo === 400);
  const pedidos = [];
  const p = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: { GITHUB_TOKEN: 't' }, git: e.git, crearRepo: async (n) => { pedidos.push(n); return e.repo(n); } });
  await assert.rejects(() => p.crear('Conocido'), (x) => x.codigo === 409);
  const r = await p.crear('Nuevo');
  assert.equal(r.nombre, 'Nuevo');
  assert.deepEqual(pedidos, ['Nuevo']);
  assert.ok(fs.existsSync(path.join(e.trabajo, 'proyectos', 'Nuevo', '.git')));
  assert.ok(fs.existsSync(path.join(e.memoria, 'Proyectos', 'Nuevo.md')));
  const falla = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: { GITHUB_TOKEN: 't' }, git: e.git, crearRepo: async () => { throw new Error('422 ya existe'); } });
  await assert.rejects(() => falla.crear('Otro'), (x) => x.codigo === 502 && /422/.test(x.message));
});

function pedir(port, metodo, ruta, { cuerpo, cab = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: metodo, path: ruta, headers: { 'content-type': 'application/json', host: 'localhost:4321', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: d ? JSON.parse(d) : null }));
    });
    r.on('error', reject);
    if (cuerpo) r.write(JSON.stringify(cuerpo));
    r.end();
  });
}

test('rutas: desde este equipo se descarga; desde la red de casa con solo el código, no', async (t) => {
  const e = entorno();
  const proyectos = new Proyectos({ trabajo: e.trabajo, memoria: e.memoria, env: {}, git: e.git });
  const codigo = 'ABCD-EFGH-JKLM';
  const servidor = crearServidor({ trabajo: e.trabajo, memoria: e.memoria, acceso: crearAcceso(codigo), proyectos });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const cookie = crearAcceso(codigo).cookie.split(';')[0];
  const casa = await pedir(port, 'POST', '/api/proyectos/descargar', { cuerpo: { nombre: 'Conocido' }, cab: { host: '192.168.1.20:4321', 'x-nullraptor': '1', cookie } });
  assert.equal(casa.estado, 403);
  const local = await pedir(port, 'POST', '/api/proyectos/descargar', { cuerpo: { nombre: 'Conocido' }, cab: { 'x-nullraptor': '1', cookie } });
  assert.equal(local.estado, 201);
  assert.equal((await pedir(port, 'POST', '/api/proyectos/descargar', { cuerpo: { nombre: 'Conocido' }, cab: { 'x-nullraptor': '1', cookie } })).estado, 409);
  assert.equal((await pedir(port, 'GET', '/api/proyectos/descargar', { cab: { cookie } })).estado, 405);
  const ajustes = await pedir(port, 'GET', '/api/ajustes', { cab: { cookie } });
  assert.equal(ajustes.datos.acceso.red, true);
});
