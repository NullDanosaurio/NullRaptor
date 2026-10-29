import test from 'node:test';
import assert from 'node:assert/strict';
import { cifrar, descifrar, leerEnv } from '../scripts/credenciales.mjs';

const clave = 'caballo correcto batería grapa';
const texto = 'GITHUB_TOKEN=github_pat_x\nCLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat-y';

test('cifra y descifra con la clave correcta', () => {
  const blob = cifrar(texto, clave);
  assert.ok(!blob.includes('github_pat_x'));
  assert.equal(descifrar(blob, clave), texto);
});

test('rechaza una clave incorrecta', () => {
  assert.throws(() => descifrar(cifrar(texto, clave), clave + 'x'), /Clave incorrecta/);
});

test('rechaza un cofre alterado', () => {
  const o = JSON.parse(cifrar(texto, clave));
  const d = Buffer.from(o.datos, 'base64'); d[0] ^= 1; o.datos = d.toString('base64');
  assert.throws(() => descifrar(JSON.stringify(o), clave), /alterado/);
});

test('exige una clave mínima', () => {
  assert.throws(() => cifrar(texto, 'diecinueve-caracter'), /20 caracteres/);
});

test('lee formato .env con comentarios y comillas', () => {
  assert.deepEqual(leerEnv('# c\nA=1\nB = "dos"\nminus=no\n'), { A: '1', B: 'dos' });
});
