import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anotarSenal, ejecutar, CARPETA } from '../scripts/relevo.mjs';
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

test('el relevo deja log, estado, briefing, señal e índice en 0600 y sus carpetas en 0700', async () => {
  const t = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-modos-'));
  const proy = path.join(t, 'proyectos', 'Demo');
  fs.mkdirSync(proy, { recursive: true });
  fs.mkdirSync(path.join(t, CARPETA), { mode: 0o755 }); // carpeta preexistente y abierta
  anotarSenal({ error: 'rate_limit', cwd: proy }, t);
  fs.writeFileSync(path.join(t, CARPETA, 'Demo.log'), '', { mode: 0o644 });
  fs.cpSync(path.join(fileURLToPath(new URL('..', import.meta.url)), 'config'), path.join(t, 'config'), { recursive: true });
  const falso = path.join(t, 'codex-falso.sh');
  fs.writeFileSync(falso, `#!/bin/sh\ncat > /dev/null\nprintf '%s\\n' '{"type":"thread.started","thread_id":"33333333-3333-4333-8333-333333333333"}'\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: path.join(t, 'casa'), BOVEDA_DIR: '', RUFLO_CODEX_EXE: falso, RUFLO_TAREAS: path.join(t, 'sin.json'), CLAUDE_FLOW_MEMORY_PATH: path.join(t, 'x') };
  await ejecutar('Demo', { trabajo: t, env, agente: t });
  const modo = (r) => fs.statSync(r).mode & 0o777;
  for (const f of ['Demo.log', 'Demo.estado.json', 'Demo.briefing.md', 'Demo.senal.json']) assert.equal(modo(path.join(t, CARPETA, f)), 0o600, f);
  assert.equal(modo(path.join(t, CARPETA)), 0o700);
  assert.equal(modo(path.join(t, '.sesiones-codex')), 0o700);
  assert.equal(modo(path.join(t, '.sesiones-codex', '33333333-3333-4333-8333-333333333333.json')), 0o600);
  assert.deepEqual(fs.readdirSync(path.join(t, '.sesiones-codex')).filter((n) => n.endsWith('.tmp')), []);
});
