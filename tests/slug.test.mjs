import {test} from 'node:test';
import assert from 'node:assert/strict';
import {slugify} from '../src/slug.mjs';
test('genera URLs legibles de productos en español',()=>{
  assert.equal(slugify('  Tu Rincón de Lectura  '),'tu-rincon-de-lectura');
  assert.equal(slugify('¡Caja Halloween! 🎃'),'caja-halloween');
  assert.equal(slugify('Niño, pingüino y café'),'nino-pinguino-y-cafe');
});
test('normaliza separadores y Unicode descompuesto',()=>{
  assert.equal(slugify('Caja___Grande---2026'),'caja-grande-2026');
  assert.equal(slugify('Cafe\u0301'),'cafe');
});
test('entradas sin caracteres útiles producen cadena vacía',()=>{
  assert.equal(slugify(''), '');assert.equal(slugify('--- 🎃 !!!'),'');
});
test('rechaza valores que no son cadenas sin convertirlos silenciosamente',()=>{
  for(const v of [null,undefined,42,{},[]])assert.throws(()=>slugify(v),TypeError);
});
