// Tareas de Ruflo en el Resumen del panel (panel/lib/tareas-ruflo.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archivoTareasRuflo, conSesiones, estadoProyecto, leerTareasRuflo, resumenTareas } from '../panel/lib/tareas-ruflo.mjs';

test('tareas de Ruflo: proyecto por «[X]» o etiqueta, abiertas en orden, hechas hoy y cuenta por proyecto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ruflo-'));
  const archivo = path.join(dir, 'store.json');
  const t = (id, description, status, createdAt, extra = {}) => ({ taskId: id, description, status, createdAt, ...extra });
  fs.writeFileSync(archivo, JSON.stringify({ version: 1, tasks: {
    a: t('a', '[Nullraptor] AHO-1 Reanudar limpio', 'completed', '2026-11-04T01:00:00Z', { completedAt: '2026-11-04T05:00:00Z' }),
    b: t('b', '[Nullraptor] AHO-2 Ajustes', 'in_progress', '2026-11-04T02:00:00Z'),
    c: t('c', 'Sin corchetes', 'pending', '2026-11-04T03:00:00Z', { tags: ['Modelos3D'] }),
    d: t('d', '[Roleplay] Vieja', 'pending', '2026-11-01T00:00:00Z'),
    e: t('e', '[Roleplay] Hecha ayer', 'completed', '2026-11-01T00:00:00Z', { completedAt: '2026-11-03T10:00:00Z' }),
    f: { taskId: 'f' }, // sin descripción: se ignora
  } }));
  const tareas = leerTareasRuflo(archivo);
  assert.equal(tareas.length, 5);
  assert.deepEqual(tareas.find((x) => x.id === 'c'), { id: 'c', proyecto: 'Modelos3D', texto: 'Sin corchetes', estado: 'pendiente', creada: '2026-11-04T03:00:00Z', cerrada: null });
  const r = resumenTareas(tareas, { hoy: new Date('2026-11-04T12:00:00Z') });
  assert.deepEqual(r.abiertas.map((x) => x.id), ['b', 'c', 'd']);
  assert.equal(r.abiertas[0].texto, 'AHO-2 Ajustes');
  assert.equal(r.totalAbiertas, 3);
  assert.equal(r.hechasHoy, 1);
  assert.deepEqual(r.porProyecto, { Nullraptor: { enCurso: 1, pendientes: 0 }, Modelos3D: { enCurso: 0, pendientes: 1 }, Roleplay: { enCurso: 0, pendientes: 1 } });
  assert.equal(resumenTareas(tareas, { max: 1 }).abiertas.length, 1);
  assert.deepEqual(leerTareasRuflo(path.join(dir, 'no-existe.json')), []);
  assert.equal(archivoTareasRuflo({ CLAUDE_FLOW_MEMORY_PATH: '/estado/ruflo/swarm' }), '/estado/ruflo/tasks/store.json');
  assert.equal(archivoTareasRuflo({ RUFLO_TAREAS: '/x.json' }), '/x.json');
});

test('avance por proyecto: 1/3 trabajando, cambia al completar, parada y esperando según el latido', () => {
  const t = (id, estado) => ({ id, proyecto: 'P', texto: id, estado, creada: '2026-11-04T10:00:00Z', cerrada: null });
  const tareas = [t('a', 'hecha'), t('b', 'en curso'), t('c', 'pendiente'), { ...t('d', 'cancelada') }];
  let r = conSesiones(resumenTareas(tareas), {}, tareas);
  assert.deepEqual(r.avance.P, { hechas: 1, enCurso: 1, pendientes: 1, total: 3, estado: 'trabajando', hace: null });
  const tras = tareas.map((x) => (x.id === 'b' ? { ...x, estado: 'hecha' } : x));
  r = conSesiones(resumenTareas(tras), { P: { hace: 30, parada: false } }, tras);
  assert.equal(r.avance.P.hechas, 2);
  assert.equal(r.avance.P.estado, 'esperando');
  assert.equal(r.avance.P.hace, 30);
  assert.equal(conSesiones(resumenTareas(tareas), { P: { hace: 900, parada: true } }, tareas).avance.P.estado, 'parada');
  assert.deepEqual(conSesiones(resumenTareas([]), { Q: { hace: 700, parada: true } }, []).avance.Q, { hechas: 0, enCurso: 0, pendientes: 0, total: 0, estado: 'parada', hace: 700 });
  assert.equal(estadoProyecto({ enCurso: 0 }, undefined), 'esperando');
});

test('estadoProyecto: una sesión terminada con tarea en curso queda «esperando»', async () => {
  const { estadoProyecto } = await import('../panel/lib/tareas-ruflo.mjs');
  const av = { hechas: 0, enCurso: 1, pendientes: 0, total: 1 };
  assert.equal(estadoProyecto(av, { terminada: false, parada: false }), 'trabajando');
  assert.equal(estadoProyecto(av, { terminada: true, parada: false }), 'esperando');
  assert.equal(estadoProyecto(av, { terminada: false, parada: true }), 'parada');
});
