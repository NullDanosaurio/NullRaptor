import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { registrarLatido } from '../scripts/latido.mjs';
import { conLatido, conRelevo } from '../scripts/ia.mjs';
import { leerSesiones, MINUTOS_PARADA } from '../panel/lib/sesiones.mjs';

function crearTrabajo(t) {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'nullraptor-latido-'));
  t.after(() => fs.rmSync(trabajo, { recursive: true, force: true }));
  return trabajo;
}

test('registrarLatido escribe fuera del proyecto y sobrescribe el último evento', (t) => {
  const trabajo = crearTrabajo(t);
  const cwd = path.join(trabajo, 'proyectos', 'Lectura', 'src');
  const entrada = { cwd, hook_event_name: 'SessionStart', session_id: 'sesion-1' };
  const inicio = new Date('2026-11-06T10:00:00.000Z');
  registrarLatido(entrada, trabajo, inicio);
  const dir = path.join(trabajo, '.sesiones');
  const ruta = path.join(dir, 'Lectura.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(ruta, 'utf8')), {
    proyecto: 'Lectura', evento: 'SessionStart', sesion: 'sesion-1', en: inicio.toISOString(),
  });
  const fin = new Date('2026-11-06T10:01:00.000Z');
  registrarLatido({ ...entrada, hook_event_name: 'Stop', session_id: 'sesion-2' }, trabajo, fin);
  assert.deepEqual(JSON.parse(fs.readFileSync(ruta, 'utf8')), {
    proyecto: 'Lectura', evento: 'Stop', sesion: 'sesion-2', en: fin.toISOString(),
  });
  assert.deepEqual(fs.readdirSync(dir), ['Lectura.json']);
  assert.equal(fs.existsSync(path.join(trabajo, 'proyectos')), false);
});

test('registrarLatido ignora cwd fuera de proyectos y tolera entradas inválidas', (t) => {
  const trabajo = crearTrabajo(t);
  for (const cwd of [trabajo, path.join(trabajo, 'proyectos'), path.join(trabajo, 'otro')]) {
    registrarLatido({ cwd, hook_event_name: 'Stop' }, trabajo);
  }
  assert.doesNotThrow(() => registrarLatido(null, trabajo));
  assert.doesNotThrow(() => registrarLatido({ cwd: 42 }, trabajo));
  assert.equal(fs.existsSync(path.join(trabajo, '.sesiones')), false);
});

test('el proceso tolera stdin vacío o roto y sale sin imprimir', (t) => {
  const trabajo = crearTrabajo(t);
  const script = fileURLToPath(new URL('../scripts/latido.mjs', import.meta.url));
  for (const input of ['', '{roto']) {
    const resultado = spawnSync(process.execPath, [script], {
      input, encoding: 'utf8', env: { ...process.env, TRABAJO_DIR: trabajo }, timeout: 5000,
    });
    assert.ifError(resultado.error);
    assert.equal(resultado.status, 0);
    assert.equal(resultado.stdout, '');
    assert.equal(resultado.stderr, '');
  }
});

test('leerSesiones distingue actividad, parada y fin, e ignora archivos rotos', (t) => {
  const trabajo = crearTrabajo(t);
  const ahora = new Date('2026-11-06T12:00:00.000Z');
  assert.equal(MINUTOS_PARADA, 10);
  assert.deepEqual(leerSesiones(trabajo, { ahora }), {});
  for (const [proyecto, segundos, evento] of [
    ['Reciente', 599, 'PostToolUse'], ['Limite', 600, 'Stop'],
    ['Parada', 601, 'Notification'], ['Terminada', 1200, 'SessionEnd'],
  ]) {
    registrarLatido({
      cwd: path.join(trabajo, 'proyectos', proyecto), hook_event_name: evento,
    }, trabajo, new Date(ahora.getTime() - segundos * 1000));
  }
  fs.writeFileSync(path.join(trabajo, '.sesiones', 'roto.json'), '{');
  fs.writeFileSync(path.join(trabajo, '.sesiones', 'nulo.json'), 'null');
  const sesiones = leerSesiones(trabajo, { ahora });
  assert.deepEqual(Object.keys(sesiones).sort(), ['Limite', 'Parada', 'Reciente', 'Terminada']);
  assert.deepEqual(sesiones.Parada, {
    evento: 'Notification', en: '2026-11-06T11:49:59.000Z', hace: 601, parada: true, terminada: false,
  });
  assert.equal(sesiones.Reciente.parada, false);
  assert.equal(sesiones.Limite.parada, false);
  assert.equal(sesiones.Terminada.parada, false);
  assert.equal(sesiones.Terminada.terminada, true);
  assert.equal(leerSesiones(trabajo, { ahora, minutos: 5 }).Reciente.parada, true);
});

test('conLatido es idempotente y conserva los hooks ajenos y los del relevo', () => {
  const agente = path.resolve('agente con espacios');
  const ajeno = { type: 'command', command: 'echo aviso' };
  const grupo = { matcher: 'Bash', hooks: [ajeno, { type: 'command', command: 'node latido.mjs' }] };
  const base = { permiso: true, hooks: { PreToolUse: [grupo], OtroEvento: [{ hooks: [ajeno] }] } };
  const relevo = conRelevo(base, agente);
  const ajustes = conLatido(relevo, agente);
  assert.deepEqual(conLatido(ajustes, agente), ajustes);
  assert.equal(ajustes.permiso, true);
  assert.deepEqual(ajustes.hooks.OtroEvento, base.hooks.OtroEvento);
  assert.deepEqual(ajustes.hooks.PreToolUse[0], { matcher: 'Bash', hooks: [ajeno] });
  assert.deepEqual(ajustes.hooks.StopFailure, relevo.hooks.StopFailure);
  assert.deepEqual(ajustes.hooks.SessionStart.slice(0, -1), relevo.hooks.SessionStart);
  for (const evento of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop', 'SessionEnd']) {
    assert.deepEqual(ajustes.hooks[evento].at(-1), {
      hooks: [{ type: 'command', command: `node "${path.join(agente, 'scripts', 'latido.mjs')}"`, timeout: 5 }],
    });
  }
  assert.equal(base.hooks.PreToolUse[0].hooks.length, 2);
});

test('registrarLatido recorta los campos y crea el archivo solo para el dueño', (t) => {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'latido-'));
  t.after(() => fs.rmSync(trabajo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(trabajo, 'proyectos', 'P'), { recursive: true });
  registrarLatido({ cwd: path.join(trabajo, 'proyectos', 'P'), hook_event_name: 'x'.repeat(500), session_id: 'y'.repeat(500) }, trabajo);
  const ruta = path.join(trabajo, '.sesiones', 'P.json');
  const datos = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  assert.equal(datos.evento.length, 64);
  assert.equal(datos.sesion.length, 64);
  assert.equal(fs.statSync(ruta).mode & 0o077, 0, 'sin permisos para otros');
});
