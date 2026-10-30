// Pruebas de la configuración de la IA (scripts/ia.mjs): instrucciones globales, MCP desde fuera de los proyectos y
// retirada de las copias de Ruflo que dejaban las versiones anteriores en la configuración global.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVO_MCP, prepararIA } from '../scripts/ia.mjs';

const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('prepararIA: CLAUDE.md global propio, MCP de Ruflo con raíz en el agente y sin restos de Ruflo', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  const configDir = path.join(base, '.claude');
  const trabajo = path.join(base, 'trabajo');
  for (const p of ['skills/swarm-advanced', 'skills/mia', 'commands/sparc', 'agents/core']) fs.mkdirSync(path.join(configDir, p), { recursive: true });
  fs.writeFileSync(path.join(configDir, 'CLAUDE.md'), '# Ruflo — Claude Code Configuration');
  fs.writeFileSync(path.join(configDir, 'commands', 'claude-flow-help.md'), 'x');

  const env = { CLAUDE_CONFIG_DIR: configDir, CLAUDE_FLOW_MEMORY_PATH: '/estado/ruflo/swarm', GITHUB_TOKEN: 'secreto' };
  const mcp = prepararIA({ agente, env, memoria: null, trabajo });

  assert.equal(mcp, path.join(trabajo, ARCHIVO_MCP));
  assert.match(fs.readFileSync(path.join(configDir, 'CLAUDE.md'), 'utf8'), /^# Nullraptor/);
  for (const p of ['skills/swarm-advanced', 'commands/sparc', 'commands/claude-flow-help.md', 'agents/core']) assert.ok(!fs.existsSync(path.join(configDir, p)), p);
  assert.ok(fs.existsSync(path.join(configDir, 'skills', 'mia'))); // lo que no es de Ruflo se queda

  const { mcpServers } = JSON.parse(fs.readFileSync(mcp, 'utf8'));
  assert.deepEqual(mcpServers.ruflo.args, [path.join(agente, 'scripts', 'ruflo-mcp.mjs')]);
  assert.equal(mcpServers.ruflo.env.CLAUDE_FLOW_MEMORY_PATH, '/estado/ruflo/swarm');
  assert.equal(JSON.stringify(mcpServers).includes('secreto'), false); // solo pasan las CLAUDE_FLOW_*
  if (process.platform !== 'win32') assert.equal(fs.statSync(mcp).mode & 0o777, 0o600);
});

test('el repositorio no lleva andamiaje de Ruflo: solo su runtime en .claude-flow', () => {
  for (const p of ['.claude/settings.json', '.claude/helpers', '.agents', '.mcp.json']) assert.ok(!fs.existsSync(path.join(agente, p)), p);
  assert.ok(fs.existsSync(path.join(agente, 'config', 'mcp.json')));
});
