import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anotarSenal, armarBriefing, esLimite, leerEnCurso, proyectoDe } from '../scripts/relevo.mjs';

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

test('leerEnCurso saca el valor de la tabla de Ruflo y devuelve null si falla', () => {
  const tabla = '[INFO] x\n+---- Memory Entry ----+\n| Key: en-curso   |\n| Value:   |\n| {"tarea":"X"}    |\n+------+\n';
  assert.equal(leerEnCurso('Demo', { correr: () => tabla }), '{"tarea":"X"}');
  assert.equal(leerEnCurso('Demo', { correr: () => 'Entry not found' }), null);
  assert.equal(leerEnCurso('Demo', { correr: () => { throw new Error('timeout'); } }), null);
});

test('armarBriefing: tareas abiertas del proyecto, estado de Ruflo, git y reglas del relevo', () => {
  const tareas = [
    { id: 't1', proyecto: 'Demo', texto: 'Hacer A', estado: 'en curso' },
    { id: 't2', proyecto: 'Demo', texto: 'Hacer B', estado: 'pendiente' },
    { id: 't3', proyecto: 'Demo', texto: 'Ya hecha', estado: 'hecha' },
    { id: 't4', proyecto: 'Otro', texto: 'De otro', estado: 'pendiente' },
  ];
  const b = armarBriefing({ proyecto: 'Demo', cwd: '/w/proyectos/Demo', senal: { en: '2026-11-04T10:00:00Z' }, tareas, enCurso: '{"tarea":"X"}', rama: 'feat', estadoGit: ' M a.js', commits: 'abc1234 algo' });
  assert.match(b, /relevas a Claude en el desarrollo de «Demo»/);
  assert.match(b, /\[en curso\] t1: Hacer A\n- \[pendiente\] t2: Hacer B/);
  assert.doesNotMatch(b, /Ya hecha|De otro/);
  assert.match(b, /proyecto-Demo \/ en-curso\)\n\{"tarea":"X"\}/);
  assert.match(b, /rama feat\)\n M a\.js/);
  assert.match(b, /sin Co-Authored-By/);
  assert.match(b, /\.relevo\/Demo\.codex\.md/);
  const vacio = armarBriefing({ proyecto: 'Demo', cwd: '/w', tareas: [], enCurso: null, rama: '', estadoGit: '', commits: '' });
  assert.match(vacio, /\(ninguna registrada en Ruflo\)/);
  assert.match(vacio, /\(no disponible\)/);
});
