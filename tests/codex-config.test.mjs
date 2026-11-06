import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import TOML from '@iarna/toml';
import { prepararCodex } from '../scripts/codex-config.mjs';
import { escribirMcp } from '../scripts/ia.mjs';

const agente = fileURLToPath(new URL('..', import.meta.url));
function entorno(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-config-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const trabajo = path.join(base, 'trabajo');
  const env = { HOME: path.join(base, 'casa'), CODEX_HOME: path.join(base, 'casa', '.codex'), CLAUDE_FLOW_MEMORY_PATH: '/estado/ruflo/swarm' };
  const mcp = escribirMcp({ agente, trabajo, env });
  return { base, agente, trabajo, env, mcp };
}

test('Codex comparte MCP y reglas, adapta funciones de Claude y conserva configuración personal', (t) => {
  const e = entorno(t);
  fs.mkdirSync(e.env.CODEX_HOME, { recursive: true });
  const personal = path.join(e.env.CODEX_HOME, 'config.toml');
  fs.writeFileSync(personal, 'model = "modelo-elegido"\n');
  const preparado = prepararCodex(e);
  assert.equal(fs.readFileSync(personal, 'utf8'), 'model = "modelo-elegido"\n');
  assert.deepEqual(preparado.ajustes.project_doc_fallback_filenames, ['CLAUDE.md']);
  const instrucciones = preparado.ajustes.developer_instructions;
  assert.doesNotMatch(instrucciones, /TodoWrite|opusplan|Sonnet|Opus/);
  assert.match(instrucciones, /AGENTS.override.md tiene prioridad sobre AGENTS.md/);
  assert.match(instrucciones, /CLAUDE.md es la alternativa/);
  assert.match(instrucciones, /proyecto-<Proyecto>/);
  assert.match(instrucciones, /incluso al reanudar/);
  assert.ok(preparado.ajustes.mcp_servers.ruflo);
  assert.ok(preparado.ajustes.mcp_servers.context7);
  const persistido = path.join(preparado.carpeta, 'ajustes.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(persistido, 'utf8')), preparado.ajustes);
  if (process.platform !== 'win32') assert.equal(fs.statSync(persistido).mode & 0o777, 0o600);
});

test('skills globales con recursos completos y licencias, sin borrar skills ajenas ni escribir en proyectos', (t) => {
  const e = entorno(t);
  const destino = path.join(e.env.HOME, '.agents', 'skills');
  for (const nombre of ['mia', 'nullraptor-obsoleta']) {
    fs.mkdirSync(path.join(destino, nombre), { recursive: true });
    fs.writeFileSync(path.join(destino, nombre, 'SKILL.md'), 'conservar');
  }
  const proyecto = path.join(e.trabajo, 'proyectos', 'A');
  fs.mkdirSync(proyecto, { recursive: true });
  const preparado = prepararCodex(e);
  for (const nombre of ['nullraptor-pc', 'nullraptor-herramienta', 'anthropic-frontend-design', 'anthropic-webapp-testing', 'anthropic-mcp-builder']) {
    assert.ok(preparado.skills.includes(nombre));
    assert.ok(fs.existsSync(path.join(destino, nombre, 'SKILL.md')));
  }
  assert.ok(fs.existsSync(path.join(destino, 'anthropic-webapp-testing', 'scripts', 'with_server.py')));
  assert.ok(fs.existsSync(path.join(destino, 'anthropic-mcp-builder', 'LICENSE.txt')));
  assert.equal(fs.readFileSync(path.join(destino, 'mia', 'SKILL.md'), 'utf8'), 'conservar');
  assert.ok(!fs.existsSync(path.join(destino, 'nullraptor-obsoleta')));
  assert.match(fs.readFileSync(path.join(destino, 'nullraptor-pc', 'SKILL.md'), 'utf8'), /herramienta de imágenes disponible/);
  prepararCodex(e);
  assert.deepEqual(fs.readdirSync(proyecto), []);
});

test('roles nativos heredan modelo, conservan vetos y no vuelven a delegar código a Codex', (t) => {
  const e = entorno(t);
  e.perfil = fs.readFileSync(path.join(agente, 'config', 'perfiles', 'director.md'), 'utf8');
  const preparado = prepararCodex(e);
  assert.equal(Object.keys(preparado.roles).length, 6);
  for (const [nombre, rol] of Object.entries(preparado.roles)) {
    const config = TOML.parse(fs.readFileSync(rol.config_file, 'utf8'));
    assert.equal(config.model, undefined);
    assert.doesNotMatch(config.developer_instructions, /TodoWrite|opusplan|model:|tools:/);
    if (nombre === 'equipo-calidad' || nombre === 'equipo-seguridad') {
      assert.match(config.developer_instructions, /VEREDICTO: APROBADO/);
      assert.match(config.developer_instructions, /no modificas archivos ni haces commits/i);
    }
    if (nombre === 'equipo-desarrollo') assert.match(config.developer_instructions, /Implementa directamente/);
  }
  assert.doesNotMatch(preparado.ajustes.developer_instructions, /Sonnet|sonnet|TodoWrite|opusplan|El código lo escribe Codex/);
  assert.match(preparado.ajustes.developer_instructions, /si no, aplica las revisiones en secuencia/);
});

test('la CLI instalada acepta los overrides y reconoce Ruflo y Context7 sin tocar la cuenta real', (t) => {
  const e = entorno(t);
  const preparado = prepararCodex(e);
  fs.mkdirSync(e.env.CODEX_HOME, { recursive: true });
  const r = spawnSync(path.join(agente, 'node_modules', '.bin', 'codex'), ['--no-daemon', ...preparado.args, 'mcp', 'list', '--json'], {
    cwd: e.base, env: { ...process.env, ...e.env }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(r.status, 0, r.stderr);
  const servidores = JSON.parse(r.stdout);
  for (const nombre of ['ruflo', 'context7']) {
    assert.ok(servidores.some((s) => s.name === nombre && s.enabled), r.stdout);
  }
});
