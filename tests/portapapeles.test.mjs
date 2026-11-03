// Copiar al portapapeles (panel/src/portapapeles.js): con navigator.clipboard y con el textarea de reserva.
import test from 'node:test';
import assert from 'node:assert/strict';
import { alPortapapeles, copiarConTextarea } from '../panel/src/portapapeles.js';

/** Documento mínimo: registra lo que pasa con el textarea y el foco. */
function documentoFalso({ copia = true, lanza = false } = {}) {
  const pasos = [];
  const anterior = { focus: (o) => pasos.push(['foco-anterior', o]) };
  const doc = {
    activeElement: anterior,
    body: { append: (el) => { pasos.push(['append', el.value]); el.enDom = true; } },
    createElement: (tipo) => {
      const el = { tipo, style: {}, atributos: {}, value: '' };
      el.setAttribute = (k, v) => { el.atributos[k] = v; };
      el.focus = (o) => pasos.push(['foco-area', o]);
      el.select = () => pasos.push(['select']);
      el.setSelectionRange = (a, b) => pasos.push(['rango', a, b, el.value]);
      el.remove = () => { el.enDom = false; pasos.push(['remove']); };
      doc.ultimo = el;
      return el;
    },
    execCommand: (orden) => { pasos.push(['exec', orden]); if (lanza) throw new Error('no'); return copia; },
  };
  return { doc, pasos };
}

test('textarea de reserva: solo lectura, fuera de la vista, selección completa (iOS) y vuelta del foco', () => {
  const { doc, pasos } = documentoFalso();
  assert.equal(copiarConTextarea('año 🦖\nlínea', doc), true);
  const area = doc.ultimo;
  assert.equal(area.readOnly, true);
  assert.equal(area.style.position, 'fixed');
  assert.equal(area.style.left, '-9999px');
  assert.equal(area.style.fontSize, '16px');
  assert.equal(area.atributos['aria-hidden'], 'true');
  assert.equal(area.enDom, false);
  assert.deepEqual(pasos.map((p) => p[0]), ['append', 'foco-area', 'select', 'rango', 'exec', 'remove', 'foco-anterior']);
  assert.deepEqual(pasos.find((p) => p[0] === 'rango').slice(1, 3), [0, 'año 🦖\nlínea'.length]);
  assert.deepEqual(pasos.find((p) => p[0] === 'exec'), ['exec', 'copy']);
});

test('textarea de reserva: si el navegador no copia (o falla), devuelve false y limpia igual', () => {
  for (const opciones of [{ copia: false }, { lanza: true }]) {
    const { doc, pasos } = documentoFalso(opciones);
    assert.equal(copiarConTextarea('x', doc), false);
    assert.equal(doc.ultimo.enDom, false);
    assert.equal(pasos.at(-1)[0], 'foco-anterior');
  }
});

test('alPortapapeles: con navigator.clipboard devuelve si funcionó (nunca lanza)', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const copiado = [];
  try {
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async (t) => { copiado.push(t); } } } });
    assert.equal(await alPortapapeles('hola'), true);
    assert.equal(await alPortapapeles(null), true);
    assert.deepEqual(copiado, ['hola', '']);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('denegado'); } } } });
    assert.equal(await alPortapapeles('hola'), false);
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
    assert.equal(await alPortapapeles('hola'), false); // sin API ni document (Node): false, sin lanzar
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});
