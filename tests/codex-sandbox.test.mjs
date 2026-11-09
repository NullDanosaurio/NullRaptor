import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { argsSandboxCodex, rutasProtegidas } from '../scripts/codex-sandbox.mjs';
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
  for (const d of [path.join(proyecto, '.git'), claude, codex, cofre, path.join(trabajo, 'registros')]) fs.mkdirSync(d, { recursive: true });
  for (const f of [path.join(claude, '.credentials.json'), path.join(codex, 'auth.json'), path.join(trabajo, '.mcp-agente.json'), path.join(cofre, 'credenciales.cifrado')]) fs.writeFileSync(f, 'FALSO', { mode: 0o600 });
  const env = { HOME: path.join(base, 'home'), CODEX_HOME: codex, CREDENCIALES: path.join(cofre, 'credenciales.cifrado'), CLAUDE_CONFIG_DIR: claude };
  return { base, trabajo, proyecto, claude, codex, cofre, env };
}

test('argsSandboxCodex: proyecto y .git escribibles; secretos ocultos; raíz de solo lectura', (t) => {
  const m = montaje();
  t.after(() => fs.rmSync(m.base, { recursive: true, force: true }));
  const a = argsSandboxCodex({ ruta: m.proyecto, escribibles: ['/x/adjuntos'], env: m.env, trabajo: m.trabajo });
  assert.deepEqual(a.slice(0, 2), ['-c', 'default_permissions="nr"']);
  const p = tabla(a);
  assert.equal(p[':root'], 'read');
  assert.equal(p[m.proyecto], 'write');
  assert.equal(p[path.join(m.proyecto, '.git')], 'write');
  assert.equal(p['/x/adjuntos'], 'write');
  for (const secreto of [m.cofre, m.claude, path.join(m.codex, 'auth.json'), path.join(m.trabajo, '.mcp-agente.json'), path.join(m.trabajo, 'registros')]) assert.equal(p[secreto], 'none', secreto);
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
  const args = argsSandboxCodex({ ruta: m.proyecto, env: m.env, trabajo: m.trabajo });
  const correr = (orden) => spawnSync('codex', ['sandbox', ...args, '--', 'sh', '-c', orden], { encoding: 'utf8', timeout: 30000 });
  for (const f of [path.join(m.claude, '.credentials.json'), path.join(m.codex, 'auth.json'), path.join(m.trabajo, '.mcp-agente.json'), path.join(m.cofre, 'credenciales.cifrado')]) {
    assert.notEqual(correr(`cat '${f}' >/dev/null`).status, 0, f);
  }
  const w = correr(`echo a > "${m.proyecto}/ok" && echo a > "${m.proyecto}/.git/obj"`);
  assert.equal(w.status, 0, w.stderr);
});
