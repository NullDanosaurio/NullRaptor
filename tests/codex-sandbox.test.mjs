import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argsSandboxCodex, rutasProtegidas } from '../scripts/codex-sandbox.mjs';
import { fileURLToPath } from 'node:url';
import { prepararSesionCodex } from '../scripts/codex-sesion.mjs';
import { ajustesTerminal } from '../panel/lib/remoto.mjs';

const tabla = (args) => {
  const t = args.find((a) => a.startsWith('permissions.nr.filesystem={')).slice('permissions.nr.filesystem='.length);
  return Object.fromEntries([...t.matchAll(/"([^"]+)"="(\w+)"/g)].map((m) => [m[1], m[2]]));
};

function montaje() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-'));
  const trabajo = path.join(base, 'trabajo');
  const proyecto = path.join(trabajo, 'proyectos', 'P');
  const claude = path.join(base, 'home', '.claude');
  const codex = path.join(base, 'home', '.codex');
  const cofre = path.join(base, 'home', '.nullraptor');
  const boveda = path.join(base, 'boveda');
  fs.mkdirSync(path.join(boveda, 'Proyectos'), { recursive: true });
  for (const d of [path.join(proyecto, '.git', 'hooks'), claude, codex, cofre, path.join(trabajo, 'registros')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(proyecto, '.git', 'config'), '[core]\n');
  for (const d of ['.config/gh', '.copilot', '.ruflo', '.pki']) fs.mkdirSync(path.join(base, 'home', d), { recursive: true });
  for (const d of ['.config/gh', '.copilot', '.ruflo', '.pki']) fs.writeFileSync(path.join(base, 'home', d, 'dato'), 'FALSO');
  fs.writeFileSync(path.join(base, 'home', '.bash_history'), 'FALSO');
  for (const f of [path.join(claude, '.credentials.json'), path.join(codex, 'auth.json'), path.join(trabajo, '.mcp-agente.json'), path.join(cofre, 'credenciales.cifrado')]) fs.writeFileSync(f, 'FALSO', { mode: 0o600 });
  const env = { HOME: path.join(base, 'home'), CODEX_HOME: codex, CREDENCIALES: path.join(cofre, 'credenciales.cifrado'), CLAUDE_CONFIG_DIR: claude };
  return { boveda, base, trabajo, proyecto, claude, codex, cofre, env };
}

test('argsSandboxCodex: proyecto y .git escribibles; secretos ocultos; raíz de solo lectura', (t) => {
  const m = montaje();
  t.after(() => fs.rmSync(m.base, { recursive: true, force: true }));
  const a = argsSandboxCodex({ ruta: m.proyecto, escribibles: ['/x/adjuntos'], memoria: m.boveda, env: m.env, trabajo: m.trabajo });
  assert.deepEqual(a.slice(0, 2), ['-c', 'default_permissions="nr"']);
  const p = tabla(a);
  assert.equal(p[':root'], 'read');
  assert.equal(p[m.proyecto], 'write');
  assert.equal(p[path.join(m.proyecto, '.git')], 'write');
  assert.equal(p['/x/adjuntos'], 'write');
  assert.equal(p[path.join(m.boveda, 'Proyectos')], 'write');
  assert.equal(p[m.boveda], undefined); // el resto de la bóveda queda en solo lectura
  assert.equal(p[path.join(m.proyecto, '.git', 'hooks')], 'read');
  assert.equal(p[path.join(m.proyecto, '.git', 'config')], 'read');
  for (const secreto of [m.cofre, m.claude, path.join(m.codex, 'auth.json'), path.join(m.trabajo, '.mcp-agente.json'), path.join(m.trabajo, 'registros')]) assert.equal(p[secreto], 'none', secreto);
  for (const r of ['.config/gh', '.copilot', '.ruflo', '.bash_history', '.pki']) assert.equal(p[path.join(m.env.HOME, r)], 'none', r);
  assert.ok(a.includes('permissions.nr.network.enabled=false'));
});

test('la lista de secretos es la misma que las reglas deny de Claude', (t) => {
  const m = montaje();
  t.after(() => fs.rmSync(m.base, { recursive: true, force: true }));
  const { carpetas, archivos } = rutasProtegidas({ env: m.env, configDir: m.claude, trabajo: m.trabajo });
  const deny = ajustesTerminal({ env: m.env, configDir: m.claude, trabajo: m.trabajo }).permissions.deny.join('\n');
  for (const c of carpetas) assert.ok(deny.includes(`Read(/${c}/**)`), c);
  for (const f of archivos) assert.ok(deny.includes(`Read(/${f})`), f);
});

const hayCodex = spawnSync('codex', ['--version']).status === 0 && spawnSync('codex', ['sandbox', '--', 'true'], { timeout: 20000 }).status === 0;
test('codex sandbox con el perfil: no lee secretos y sí escribe en el proyecto', { skip: !hayCodex && 'codex sandbox no disponible' }, (t) => {
  const m = montaje();
  t.after(() => fs.rmSync(m.base, { recursive: true, force: true }));
  const args = argsSandboxCodex({ ruta: m.proyecto, memoria: m.boveda, env: m.env, trabajo: m.trabajo });
  const correr = (orden) => spawnSync('codex', ['sandbox', ...args, '--', 'sh', '-c', orden], { encoding: 'utf8', timeout: 30000 });
  for (const f of [...['.config/gh/dato', '.copilot/dato', '.ruflo/dato', '.pki/dato', '.bash_history'].map((r) => path.join(m.env.HOME, r)), path.join(m.claude, '.credentials.json'), path.join(m.codex, 'auth.json'), path.join(m.trabajo, '.mcp-agente.json'), path.join(m.cofre, 'credenciales.cifrado')]) {
    assert.notEqual(correr(`cat '${f}' >/dev/null`).status, 0, f);
  }
  const w = correr(`echo a > "${m.proyecto}/ok" && echo a > "${m.proyecto}/.git/obj"`);
  assert.equal(w.status, 0, w.stderr);
  const g = path.join(m.proyecto, '.git');
  for (const orden of [`echo x > "${g}/hooks/pre-commit"`, `echo x > "${g}/config"`, `echo x > "${g}/config.lock" && mv "${g}/config.lock" "${g}/config"`]) assert.notEqual(correr(orden).status, 0, orden);
  assert.equal(fs.readFileSync(path.join(g, 'config'), 'utf8'), '[core]\n');
  assert.deepEqual(fs.readdirSync(path.join(g, 'hooks')), []);
  // La bóveda de la prueba va fuera de /tmp (que es escribible a propósito).
  const fuera = fs.mkdtempSync(path.join(os.homedir(), '.prueba-boveda-'));
  t.after(() => fs.rmSync(fuera, { recursive: true, force: true }));
  fs.mkdirSync(path.join(fuera, 'Proyectos'));
  m.boveda = fuera;
  const args2 = argsSandboxCodex({ ruta: m.proyecto, memoria: fuera, env: m.env, trabajo: m.trabajo });
  const correr2 = (orden) => spawnSync('codex', ['sandbox', ...args2, '--', 'sh', '-c', orden], { encoding: 'utf8', timeout: 30000 });
  const fueraDeProyectos = correr2(`echo x > "${m.boveda}/otra.md"`);
  assert.notEqual(fueraDeProyectos.status, 0);
  assert.equal(correr2(`echo x > "${m.boveda}/Proyectos/P.md"`).status, 0);
});

test('el perfil quita tokens y claves del entorno de los comandos de Codex', { skip: !hayCodex && 'codex sandbox no disponible' }, () => {
  const args = argsSandboxCodex({ ruta: '/tmp', env: {}, trabajo: null });
  assert.ok(args.includes('shell_environment_policy.inherit="all"'));
  const env = { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_TOKEN: 'a', NULLRAPTOR_PUENTE_TOKEN: 'b', CLAUDE_CODE_OAUTH_TOKEN: 'c', CLAUDE_CODE_MESSAGING_TOKEN: 'd', GIT_CONFIG_COUNT: '1', OTRA: 'visible' };
  const r = spawnSync('codex', ['sandbox', ...args, '--', 'sh', '-c', 'env | grep -cE "TOKEN|GIT_CONFIG"; echo $OTRA'], { encoding: 'utf8', env, timeout: 30000 });
  assert.equal(r.stdout.trim(), '0\nvisible');
});

test('sin CLAUDE_CONFIG_DIR se oculta $HOME/.claude y prepararSesionCodex crea las rutas de secretos', (t) => {
  const m = montaje();
  t.after(() => fs.rmSync(m.base, { recursive: true, force: true }));
  const env = { ...m.env };
  delete env.CLAUDE_CONFIG_DIR;
  assert.equal(tabla(argsSandboxCodex({ ruta: m.proyecto, env, trabajo: m.trabajo }))[m.claude], 'none');
  fs.rmSync(path.join(m.trabajo, 'registros'), { recursive: true });
  fs.rmSync(path.join(m.trabajo, '.mcp-agente.json'));
  prepararSesionCodex({ agente: fileURLToPath(new URL('..', import.meta.url)), env, memoria: null, trabajo: m.trabajo });
  assert.ok(fs.statSync(path.join(m.trabajo, 'registros')).isDirectory());
  assert.ok(fs.existsSync(path.join(m.trabajo, '.mcp-agente.json')));
  assert.equal(tabla(argsSandboxCodex({ ruta: m.proyecto, env, trabajo: m.trabajo }))[path.join(m.trabajo, 'registros')], 'none');
});
