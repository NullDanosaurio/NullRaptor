import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { instalarEquipo } from '../scripts/ia.mjs';
import { contenidoRolCodex, instruccionesCodex } from '../scripts/codex-instrucciones.mjs';

const agente = fileURLToPath(new URL('..', import.meta.url));
const skill = path.join(agente, 'config', 'externo', 'ponytail', 'SKILL.md');
const CON = ['equipo-desarrollo', 'equipo-arquitectura', 'equipo-producto'];
const SIN = ['equipo-calidad', 'equipo-seguridad', 'equipo-diseno'];

test('ponytail: el SKILL.md coincide con el sha256 de ORIGEN.md y no está en config/skills', () => {
  const origen = fs.readFileSync(path.join(agente, 'config', 'externo', 'ponytail', 'ORIGEN.md'), 'utf8');
  const sha = createHash('sha256').update(fs.readFileSync(skill)).digest('hex');
  assert.ok(origen.includes(sha));
  assert.match(origen, /96608e078b2d5ea607c5c3b8b5a54d1c1fba6846/);
  assert.ok(fs.existsSync(path.join(agente, 'config', 'externo', 'ponytail', 'LICENSE')));
  assert.ok(!fs.existsSync(path.join(agente, 'config', 'skills', 'ponytail')));
});

test('ponytail: lo leen desarrollo, arquitectura y producto (ruta resuelta y existente); calidad, seguridad y diseño no', (t) => {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-'));
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }));
  instalarEquipo(agente, configDir);
  for (const n of CON) {
    const texto = fs.readFileSync(path.join(configDir, 'agents', `${n}.md`), 'utf8');
    assert.ok(texto.includes(skill), n);
    assert.ok(!texto.includes('{{AGENTE}}'), n);
  }
  for (const n of SIN) assert.ok(!/ponytail/i.test(fs.readFileSync(path.join(configDir, 'agents', `${n}.md`), 'utf8')), n);
  assert.ok(fs.existsSync(skill));
});

test('ponytail en Codex: rol de desarrollo e instrucciones generales con la ruta; los roles de revisión no', () => {
  assert.ok(contenidoRolCodex(agente, 'equipo-desarrollo', '').includes(skill));
  assert.ok(instruccionesCodex(agente).includes(skill));
  for (const n of SIN) {
    const texto = fs.readFileSync(path.join(agente, 'config', 'agentes', `${n}.md`), 'utf8');
    assert.ok(!/ponytail/i.test(contenidoRolCodex(agente, n, texto)), n);
  }
});
