import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AUTOAPROBADAS, ajustesMcpCodex } from '../scripts/codex-mcp.mjs';

test('solo ruflo y context7 se auto-aprueban, con lista cerrada; nunca approve sin enabled_tools', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-apr-'));
  const mcp = path.join(d, 'mcp.json');
  const srv = { command: 'x' };
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { ruflo: srv, context7: srv, 'herramienta-blender': srv, otro: srv } }));
  const { mcp_servers: s } = ajustesMcpCodex({ agente: '/a', mcp });
  fs.rmSync(d, { recursive: true, force: true });
  assert.deepEqual(s.ruflo.enabled_tools, ['task_list', 'task_create', 'task_update', 'task_complete', 'task_status', 'task_summary', 'memory_store', 'memory_retrieve', 'memory_search', 'memory_list']);
  assert.deepEqual(s.context7.enabled_tools, ['resolve-library-id', 'query-docs']);
  for (const [nombre, c] of Object.entries(s)) {
    if (c.default_tools_approval_mode === 'approve') assert.ok(Array.isArray(c.enabled_tools) && c.enabled_tools.length, nombre);
  }
  for (const nombre of ['herramienta-blender', 'otro']) assert.equal(s[nombre].default_tools_approval_mode, undefined, nombre);
  for (const peligrosa of ['terminal_execute', 'http_fetch', 'agent_spawn']) assert.ok(!AUTOAPROBADAS.ruflo.some((t) => t.startsWith(peligrosa)), peligrosa);
});
