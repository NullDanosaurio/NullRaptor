import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anotarSenal, esLimite, proyectoDe } from '../scripts/relevo.mjs';

const trabajo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-'));

test('esLimite: solo el límite de uso y el saldo cuentan como «sin tokens»', () => {
  assert.equal(esLimite({ error: 'rate_limit' }), true);
  assert.equal(esLimite({ error: 'billing_error' }), true);
  for (const e of ['server_error', 'unknown', 'max_output_tokens', undefined]) assert.equal(esLimite({ error: e }), false);
  assert.equal(esLimite(null), false);
});

test('proyectoDe: solo dentro de $TRABAJO_DIR/proyectos/<Proyecto>', () => {
  const t = trabajo();
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo'), t), 'Demo');
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo', 'src', 'x'), t), 'Demo');
  for (const fuera of [path.join(t, 'proyectos'), path.join(t, 'otra'), path.join(t, 'proyectos', '..', 'x'), '/tmp']) assert.equal(proyectoDe(fuera, t), null);
  assert.equal(proyectoDe(undefined, t), null);
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo'), undefined), null);
});

test('anotarSenal escribe la señal del proyecto y no hace nada si no procede', () => {
  const t = trabajo();
  const cwd = path.join(t, 'proyectos', 'Demo');
  const r = anotarSenal({ error: 'rate_limit', cwd, session_id: 's1' }, t, new Date('2026-11-04T10:00:00Z'));
  assert.equal(r.proyecto, 'Demo');
  assert.deepEqual(JSON.parse(fs.readFileSync(r.ruta, 'utf8')), { proyecto: 'Demo', cwd, error: 'rate_limit', sesion: 's1', en: '2026-11-04T10:00:00.000Z' });
  assert.equal(r.ruta, path.join(t, '.relevo', 'Demo.senal.json'));
  assert.equal(anotarSenal({ error: 'server_error', cwd }, t), null);
  assert.equal(anotarSenal({ error: 'rate_limit', cwd: '/tmp' }, t), null);
});
