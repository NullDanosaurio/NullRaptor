// Texto y lenguaje de los bloques de código del Markdown (panel/src/codigo.js), con el árbol hast que genera
// react-markdown (comprobado con remark-parse + remark-rehype del panel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lenguajeDe, textoDeCodigo } from '../panel/src/codigo.js';

const pre = (texto, className) => ({
  type: 'element', tagName: 'pre', properties: {},
  children: [{ type: 'element', tagName: 'code', properties: className ? { className } : {}, children: [{ type: 'text', value: texto }] }],
});

test('copia el código exacto: sin ``` ni etiqueta, con líneas en blanco, sangría y comillas invertidas', () => {
  const p = pre('const a = `x`;\n\n  if (a) {}\n', ['language-js']);
  assert.equal(textoDeCodigo(p), 'const a = `x`;\n\n  if (a) {}');
  assert.equal(lenguajeDe(p), 'js');
});

test('sin lenguaje; solo se quita un salto final; texto partido en varios nodos', () => {
  assert.equal(lenguajeDe(pre('a\n')), null);
  assert.equal(textoDeCodigo(pre('a\n\n\n')), 'a\n\n');
  const partido = { type: 'element', tagName: 'pre', children: [{ type: 'element', tagName: 'code', properties: { className: 'language-sh otra' }, children: [
    { type: 'text', value: 'echo ' }, { type: 'element', tagName: 'span', children: [{ type: 'text', value: '"hola"' }] }, { type: 'text', value: '\n' }] }] };
  assert.equal(textoDeCodigo(partido), 'echo "hola"');
  assert.equal(lenguajeDe(partido), 'sh');
  assert.equal(textoDeCodigo(undefined), '');
});
