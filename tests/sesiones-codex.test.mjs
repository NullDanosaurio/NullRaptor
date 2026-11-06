// Desarrollo persistente en la terminal compartida; los chats exec no aparecen en el historial.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { entorno, nuevo } from './apoyo/remoto.mjs';
import { registrarRelevoCodex, sesionesCodex } from '../scripts/sesiones-codex.mjs';
import { Actualizacion } from '../panel/lib/actualizacion.mjs';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
function preparar(t) {
  const e = entorno();
  t.after(() => fs.rmSync(e.base, { recursive: true, force: true }));
  const r = nuevo(e);
  const dir = path.join(e.base, '.codex', 'sessions', '2026', '11', '06');
  fs.mkdirSync(dir, { recursive: true });
  const guardar = (id, proyecto, source, fecha = '2026-11-06T12:00:00Z') => {
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: {
      id, cwd: path.join(e.trabajo, 'proyectos', proyecto), timestamp: fecha, source,
    } }) + '\n');
  };
  return { ...e, ...r, guardar, dir };
}

test('Codex abre la terminal con escritura, sin daemon ni perfil; Claude sigue siendo el predeterminado', (t) => {
  const { remoto, lanzados, trabajo } = preparar(t);
  const s = remoto.abrir('A', { ia: 'codex' });
  assert.equal(s.ia, 'codex');
  assert.equal(s.estado, 'conectada');
  const h = lanzados[0];
  assert.equal(h.opciones.cwd, path.join(trabajo, 'proyectos', 'A'));
  assert.equal(h.opciones.ia, 'codex');
  assert.equal(h.opciones.env.AGENTE_CLAVE, undefined);
  assert.ok(h.args.includes('--no-daemon'));
  assert.equal(h.args[h.args.indexOf('--sandbox') + 1], 'workspace-write');
  assert.equal(h.args[h.args.indexOf('--ask-for-approval') + 1], 'on-request');
  remoto.escribir(s.id, 'Modifica el proyecto\r');
  assert.equal(h.stdin.read(), 'Modifica el proyecto\r');
  assert.throws(() => remoto.abrir('B', { ia: 'codex', perfil: 'director' }), { codigo: 400 });
  assert.throws(() => remoto.abrir('B', { ia: 'otra' }), { codigo: 400 });
  assert.equal(remoto.abrir('B').ia, 'claude');
  t.after(() => remoto.cerrarTodas());
});

test('historial nativo tras reinicio: reanudar ID exacto y excluir chats, otros proyectos y rutas arbitrarias', (t) => {
  const { remoto, lanzados, guardar, dir } = preparar(t);
  guardar(ids[0], 'A', 'cli');
  guardar(ids[1], 'A', 'exec', '2026-11-06T13:00:00Z'); // consulta más reciente
  guardar(ids[2], 'B', 'cli');
  fs.writeFileSync(path.join(dir, 'roto.jsonl'), '{');
  assert.equal(sesionesCodex(remoto.env).length, 3);
  assert.deepEqual(remoto.historialCodex('A').map((s) => s.id), [ids[0]]);
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: ids[2] }), { codigo: 404 });
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: '../fuera' }), { codigo: 404 });
  assert.throws(() => remoto.abrir('C', { ia: 'codex', continuar: true }), { codigo: 404 });
  const s = remoto.abrir('A', { ia: 'codex', continuar: true });
  assert.equal(s.sesionCodex, ids[0]);
  assert.deepEqual(lanzados[0].args.slice(-2), ['resume', ids[0]]);
  assert.ok(!lanzados[0].args.includes('--last'));
  t.after(() => remoto.cerrarTodas());
});

test('relevos terminados e interrumpidos se retoman; el índice conserva relevos anteriores y bloquea escritores simultáneos', (t) => {
  const { remoto, trabajo, guardar } = preparar(t);
  guardar(ids[0], 'A', 'exec');
  registrarRelevoCodex(trabajo, { id: ids[0], cwd: path.join(trabajo, 'proyectos', 'A'), proyecto: 'A' });
  assert.equal(remoto.historialCodex('A')[0].relevo, true);
  const dir = path.join(trabajo, '.relevo');
  fs.mkdirSync(dir);
  const estado = path.join(dir, 'A.estado.json');
  fs.writeFileSync(estado, JSON.stringify({ estado: 'en curso', pid: process.pid, sesionCodex: ids[0] }));
  assert.equal(remoto.historialCodex('A')[0].enCurso, true);
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: ids[0] }), { codigo: 409 });
  assert.throws(() => remoto.abrir('A'), { codigo: 409 });
  fs.writeFileSync(estado, JSON.stringify({ estado: 'en curso', pid: 2 ** 22 + 12345, sesionCodex: ids[0] }));
  assert.equal(remoto.historialCodex('A')[0].enCurso, false);
  assert.equal(remoto.abrir('A', { ia: 'codex', sesionCodex: ids[0] }).sesionCodex, ids[0]);
  t.after(() => remoto.cerrarTodas());
});

test('reinicio del panel conserva el motor de cada proyecto', (t) => {
  const { trabajo } = preparar(t);
  const a = new Actualizacion({ trabajo });
  a.guardarReanudar(['A', 'B'], {}, { A: 'codex', B: 'claude' }, { A: ids[0] });
  assert.deepEqual(a.tomarReanudar(), [{ proyecto: 'A', perfil: null, ia: 'codex', sesionCodex: ids[0] }, { proyecto: 'B', perfil: null }]);
});
