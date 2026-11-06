import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import TOML from '@iarna/toml';
import { toml, argumentosConfig, ajustesMcpCodex } from '../scripts/codex-mcp.mjs';
import { entornoMcp } from '../scripts/codex-mcp-puente.mjs';

const agente = fileURLToPath(new URL('..', import.meta.url));
const puente = path.join(agente, 'scripts', 'codex-mcp-puente.mjs');

function temporal(t, servidores) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nullraptor-mcp-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const mcp = path.join(dir, 'config privada.json');
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: servidores }), { mode: 0o600 });
  return { dir, mcp };
}

test('los overrides son TOML válido y conservan nombres literales sin incluir secretos', (t) => {
  const nombre = 'herramienta.con "comillas"';
  const { mcp } = temporal(t, {
    [nombre]: { command: 'ejecutable', args: ['secreto-en-argumento'], env: { TOKEN: 'secreto-en-entorno' } },
    remoto: { type: 'http', url: 'https://ejemplo.invalid', headers: { Authorization: 'secreto-en-cabecera' } },
  });
  const args = argumentosConfig(ajustesMcpCodex({ agente, mcp }));
  const documento = args.filter((_, i) => i % 2 === 1).join('\n');
  const config = TOML.parse(documento);
  assert.deepEqual(Object.keys(config.mcp_servers).sort(), [nombre, 'remoto'].sort());
  assert.deepEqual(config.mcp_servers[nombre].args, [puente, mcp, nombre]);
  assert.equal(config.mcp_servers[nombre].command, process.execPath);
  assert.equal(config.mcp_servers.remoto.enabled, true);
  assert.ok(!documento.includes('secreto-en-'));
  assert.ok(args.filter((_, i) => i % 2 === 0).every((arg) => arg === '-c'));
});

test('serializa tablas y valores TOML escapados sin convertir puntos en rutas', () => {
  const valor = { 'clave.con.puntos': ['línea\ncon "comillas"'], activo: true, numero: 8, tabla: { ruta: 'C:\\carpeta' } };
  assert.deepEqual(TOML.parse(`dato=${toml(valor)}`).dato, valor);
  assert.throws(() => toml(null), /no admitido/);
  assert.throws(() => toml(undefined), /no admitido/);
});

test('el entorno del MCP excluye credenciales heredadas y admite las configuradas explícitamente', () => {
  const base = { PATH: '/bin', HOME: '/casa', LANG: 'es', TZ: 'UTC', OPENAI_API_KEY: 'no-heredar',
    AGENTE_CLAVE: 'no-heredar', CLAUDE_CODE_OAUTH_TOKEN: 'no-heredar', OTRA: 'no-heredar' };
  assert.deepEqual(entornoMcp({ env: { TOKEN: 'autorizado', LANG: 'es_ES' } }, base), {
    PATH: '/bin', HOME: '/casa', LANG: 'es_ES', TZ: 'UTC', TOKEN: 'autorizado',
  });
  assert.deepEqual(entornoMcp({}, {}), {});
});

test('el puente stdio transmite peticiones y respuestas al proceso con cwd y entorno aprobados', (t) => {
  const { dir, mcp } = temporal(t, {});
  const falso = path.join(dir, 'servidor.mjs');
  fs.writeFileSync(falso, `let entrada = ''; process.stdin.setEncoding('utf8');
process.stdin.on('data', dato => entrada += dato);
process.stdin.on('end', () => console.log(JSON.stringify({ entrada, cwd: process.cwd(),
  token: process.env.TOKEN, heredado: process.env.AGENTE_CLAVE ?? null })));
`);
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { prueba: {
    command: process.execPath, args: [falso], cwd: dir, env: { TOKEN: 'solo-para-servidor' },
  } } }));
  const entrada = '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n';
  const resultado = spawnSync(process.execPath, [puente, mcp, 'prueba'], {
    input: entrada, encoding: 'utf8', timeout: 10_000, env: { ...process.env, AGENTE_CLAVE: 'no-heredar' },
  });
  assert.equal(resultado.error, undefined);
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.equal(resultado.stderr, '');
  assert.deepEqual(JSON.parse(resultado.stdout), { entrada, cwd: dir, token: 'solo-para-servidor', heredado: null });
});

test('el puente rechaza servidores ausentes y transportes inválidos sin revelar datos privados', (t) => {
  const { mcp } = temporal(t, { invalido: { url: 'file:///secreto-privado', headers: { TOKEN: 'no-mostrar' } } });
  for (const nombre of ['ausente', 'invalido']) {
    const resultado = spawnSync(process.execPath, [puente, mcp, nombre], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(resultado.status, 1);
    assert.equal(resultado.stdout, '');
    assert.match(resultado.stderr, /Revisa su aprobación/);
    assert.ok(!resultado.stderr.includes('secreto-privado'));
    assert.ok(!resultado.stderr.includes('no-mostrar'));
  }
});
