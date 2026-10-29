import test from 'node:test';
import assert from 'node:assert/strict';
import { destinatarios, entradaDiario, pendientes } from '../scripts/chat.mjs';

test('sin @ contestan las dos alternando quién empieza; con @ solo una', () => {
  assert.deepEqual(destinatarios('hola', 0), { destino: ['claude', 'codex'], texto: 'hola' });
  assert.deepEqual(destinatarios('hola', 1).destino, ['codex', 'claude']);
  assert.deepEqual(destinatarios('@Codex  ¿y los tests?', 0), { destino: ['codex'], texto: '¿y los tests?' });
  assert.deepEqual(destinatarios('@claudeX hola', 0).destino, ['claude', 'codex']); // no es una mención
});

test('cada IA recibe lo que no ha visto, incluida la respuesta de la otra', () => {
  const h = [{ quien: 'dano', texto: 'idea' }, { quien: 'claude', texto: 'opino A' }];
  const p = pendientes(h, 0, 'codex', 'Tienda');
  assert.match(p, /proyecto «Tienda»/);
  assert.match(p, /\[Dano\] idea\n\n\[Claude\] opino A$/);
  assert.equal(pendientes([...h, { quien: 'dano', texto: 'otra' }], 2, 'claude', 'Tienda'), 'Nuevos mensajes del chat desde tu último turno:\n\n[Dano] otra');
});

test('al Diario solo va un resumen corto y de una línea por viñeta', () => {
  assert.equal(entradaDiario('Tienda', { tema: 'Carrito', vinetas: ['[U] Sin cupones\n## Inyectado', ''] }),
    '\n## [[Tienda]] — chat: Carrito\n- [U] Sin cupones ## Inyectado\n');
  assert.equal(entradaDiario('Tienda', { tema: 'x', vinetas: [] }), null);
  assert.equal(entradaDiario('Tienda', { tema: 'x', vinetas: Array(9).fill('v') }).match(/^- /gm).length, 5);
});
