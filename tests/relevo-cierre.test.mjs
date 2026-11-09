import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ejecutar, CARPETA } from '../scripts/relevo.mjs';
import { relevosCodex } from '../scripts/sesiones-codex.mjs';

test('ejecutar procesa la última línea JSON sin salto de línea y tras la salida', async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-cierre-'));
  fs.mkdirSync(path.join(t, CARPETA), { recursive: true });
  fs.mkdirSync(path.join(t, 'proyectos', 'Demo'), { recursive: true });
  fs.writeFileSync(path.join(t, CARPETA, 'Demo.senal.json'), JSON.stringify({ proyecto: 'Demo', cwd: path.join(t, 'proyectos', 'Demo'), error: 'rate_limit' }));
  fs.cpSync(path.join(fileURLToPath(new URL('..', import.meta.url)), 'config'), path.join(t, 'config'), { recursive: true });
  const falso = path.join(t, 'codex-falso.sh');
  // El nieto escribe después de que el padre salga: solo «close» espera a stdout.
  fs.writeFileSync(falso, `#!/bin/sh\ncat > /dev/null\n(sleep 0.3; printf '%s' '{"type":"thread.started","thread_id":"22222222-2222-4222-8222-222222222222"}') &\nexit 0\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: path.join(t, 'casa'), BOVEDA_DIR: '', RUFLO_CODEX_EXE: falso, RUFLO_TAREAS: path.join(t, 'sin.json'), CLAUDE_FLOW_MEMORY_PATH: path.join(t, 'x') };
  assert.equal(await ejecutar('Demo', { trabajo: t, env, agente: t }), 0);
  assert.deepEqual(relevosCodex(t).map((r) => r.id), ['22222222-2222-4222-8222-222222222222']);
  const estado = JSON.parse(fs.readFileSync(path.join(t, CARPETA, 'Demo.estado.json'), 'utf8'));
  assert.equal(estado.estado, 'terminado');
});
