// Pruebas del OSC 52 con el que Claude Code copia al portapapeles desde la terminal del panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { textoOsc52 } from '../panel/src/osc52.js';

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');

test('decodifica el texto copiado, con acentos y emojis', () => {
  assert.equal(textoOsc52(`c;${b64('Hola, año 🦖\nsegunda línea')}`), 'Hola, año 🦖\nsegunda línea');
  assert.equal(textoOsc52(`;${b64('sin destino')}`), 'sin destino');
});

test('ignora consultas, vacíos y base64 roto', () => {
  assert.equal(textoOsc52('c;?'), null);
  assert.equal(textoOsc52('c;'), null);
  assert.equal(textoOsc52('sin-punto-y-coma'), null);
  assert.equal(textoOsc52('c;%%%'), null);
  assert.equal(textoOsc52(`c;${Buffer.from([0xff, 0xfe]).toString('base64')}`), null);
});
