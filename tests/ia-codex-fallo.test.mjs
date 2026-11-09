import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepararIA } from '../scripts/ia.mjs';

test('prepararIA sigue y devuelve el MCP aunque prepararCodex lance', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-codex-'));
  const agente = fileURLToPath(new URL('..', import.meta.url));
  const avisos = [];
  t.mock.method(console, 'warn', (m) => avisos.push(m));
  const mcp = prepararIA({ agente, env: {}, memoria: null, trabajo: path.join(base, 'trabajo'), codex: () => { throw new Error('roto'); } });
  assert.ok(fs.existsSync(mcp));
  assert.match(avisos.join(), /Codex.*roto/);
});
