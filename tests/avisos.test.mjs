import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularAvisos } from '../panel/lib/avisos.mjs';

const en = '2026-11-06T12:00:00.000Z';
const sesion = (evento, cambios = {}) => ({
  evento, en, hace: 30, parada: false, terminada: evento === 'SessionEnd', ...cambios,
});
const tarea = (proyecto, estado = 'en curso', texto = 'Preparar el panel') => ({
  proyecto, estado, texto,
});

test('avisa de una parada e incluye la tarea en curso', () => {
  const sesiones = { Panel: sesion('PostToolUse', { parada: true, hace: 900 }) };
  assert.deepEqual(calcularAvisos(sesiones, [tarea('Panel')]), [{
    proyecto: 'Panel', tipo: 'parada',
    texto: 'Sin actividad hace 15 min · Preparar el panel', en,
  }]);
  assert.equal(calcularAvisos(sesiones, [])[0].texto, 'Sin actividad hace 15 min');
});

test('avisa de SessionEnd aunque quede una tarea en curso', () => {
  assert.deepEqual(calcularAvisos({ Panel: sesion('SessionEnd') }, [tarea('Panel')]), [{
    proyecto: 'Panel', tipo: 'terminada', texto: 'Sesión terminada', en,
  }]);
});

test('avisa de Stop cuando el proyecto espera', () => {
  assert.deepEqual(calcularAvisos({ Panel: sesion('Stop') }, [
    tarea('Panel', 'pendiente'), tarea('Panel', 'hecha'),
  ]), [{
    proyecto: 'Panel', tipo: 'terminada',
    texto: 'Turno terminado, esperando indicaciones', en,
  }]);
});

test('un proyecto trabajando no avisa por Stop ni por un latido reciente', () => {
  for (const evento of ['Stop', 'PostToolUse']) {
    assert.deepEqual(calcularAvisos({ Panel: sesion(evento) }, [tarea('Panel')]), []);
  }
});

test('Notification avisa también con una tarea en curso', () => {
  const sesiones = { Panel: sesion('Notification') };
  assert.deepEqual(calcularAvisos(sesiones, [tarea('Panel')]), [{
    proyecto: 'Panel', tipo: 'espera',
    texto: 'Claude espera tu respuesta · Preparar el panel', en,
  }]);
  assert.equal(calcularAvisos(sesiones, [])[0].texto, 'Claude espera tu respuesta');
});

test('una Notification parada genera un único aviso de parada', () => {
  const sesiones = { Panel: sesion('Notification', { parada: true, hace: 1200 }) };
  assert.deepEqual(calcularAvisos(sesiones, []), [{
    proyecto: 'Panel', tipo: 'parada', texto: 'Sin actividad hace 20 min', en,
  }]);
});

test('otros eventos recientes y proyectos sin sesión no generan avisos', () => {
  for (const evento of ['PostToolUse', 'SessionStart', 'Desconocido']) {
    assert.deepEqual(calcularAvisos({ Panel: sesion(evento) }, []), []);
  }
  assert.deepEqual(calcularAvisos({}, [tarea('Panel')]), []);
});

test('recorta el texto a 120 caracteres incluyendo los puntos suspensivos', () => {
  const sesiones = { Panel: sesion('Notification') };
  const prefijo = 'Claude espera tu respuesta · ';
  const exacto = 'a'.repeat(120 - prefijo.length);
  assert.equal(calcularAvisos(sesiones, [tarea('Panel', 'en curso', exacto)])[0].texto,
    `${prefijo}${exacto}`);
  const texto = calcularAvisos(sesiones, [tarea('Panel', 'en curso', 'a'.repeat(300))])[0].texto;
  assert.equal(texto.length, 120);
  assert.equal(texto, `${prefijo}${'a'.repeat(119 - prefijo.length)}…`);
});

test('ordena por fecha y aplica el límite predeterminado y el indicado', () => {
  const sesiones = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [
    `Proyecto ${i}`, sesion('SessionEnd', {
      en: new Date(Date.parse(en) + i * 60000).toISOString(),
    }),
  ]));
  const avisos = calcularAvisos(sesiones, []);
  assert.equal(avisos.length, 10);
  assert.deepEqual(avisos.map((a) => a.proyecto),
    Array.from({ length: 10 }, (_, i) => `Proyecto ${11 - i}`));
  assert.deepEqual(calcularAvisos(sesiones, [], { max: 2 }), avisos.slice(0, 2));
  assert.deepEqual(calcularAvisos(sesiones, [], { max: 0 }), []);
});

test('trata las claves peligrosas como proyectos y omite sesiones heredadas', () => {
  const sesiones = Object.create({ Heredado: sesion('SessionEnd') });
  for (const proyecto of ['__proto__', 'constructor', 'toString']) {
    Object.defineProperty(sesiones, proyecto, {
      value: sesion('Notification'), enumerable: true,
    });
  }
  const tareas = ['__proto__', 'constructor', 'toString'].map((p) => tarea(p));
  const avisos = calcularAvisos(sesiones, tareas);
  assert.equal(avisos.length, 3);
  for (const aviso of avisos) {
    assert.equal(aviso.tipo, 'espera');
    assert.equal(aviso.texto, 'Claude espera tu respuesta · Preparar el panel');
  }
  const parada = JSON.parse('{"__proto__":{}}');
  parada.__proto__ = sesion('Stop');
  assert.equal(calcularAvisos(parada, [tarea('__proto__')]).length, 0);
  assert.equal(calcularAvisos(parada, [])[0].tipo, 'terminada');
});
