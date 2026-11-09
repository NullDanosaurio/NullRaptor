import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { entorno, nuevo } from './apoyo/remoto.mjs';
import { ARCHIVO_MCP } from '../scripts/ia.mjs';

test('abrir con Codex rehace el MCP una sola vez y no pasa argumentos de Claude', (t) => {
  const e = entorno();
  t.after(() => fs.rmSync(e.base, { recursive: true, force: true }));
  let llamadas = 0;
  const marca = '{"mcpServers":{"marca":{"command":"x"}}}';
  const { remoto, lanzados } = nuevo(e, { prepararMcp: () => { llamadas += 1; fs.writeFileSync(path.join(e.trabajo, ARCHIVO_MCP), marca); } });
  remoto.abrir('A', { ia: 'codex' });
  assert.equal(llamadas, 1);
  assert.equal(fs.readFileSync(path.join(e.trabajo, ARCHIVO_MCP), 'utf8'), marca); // nadie lo sobrescribe después
  for (const a of ['--remote-control', '--mcp-config', '--settings', '--permission-mode']) assert.ok(!lanzados[0].args.includes(a), a);
});
