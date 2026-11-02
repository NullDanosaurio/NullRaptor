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

test('con una IA elegida (panel) solo contesta esa, aunque el mensaje lleve @ de la otra', async () => {
  const { BIN } = await import('../flujo/lib/comun.mjs');
  const { Chat } = await import('../scripts/chat.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-'));
  const antes = { claude: BIN.claude, codex: BIN.codex };
  Object.assign(BIN, { claude: path.join(base, 'no-claude'), codex: path.join(base, 'no-codex') }); // fallan al lanzarse
  try {
    const chat = new Chat({ ruta: base, carpeta: path.join(base, 'chats'), ia: 'codex' });
    const intentos = [];
    chat.on('escribiendo', (ia) => { if (ia) intentos.push(ia); });
    await chat.enviar('hola');
    await chat.enviar('@claude ¿y tú?');
    assert.deepEqual(intentos, ['codex', 'codex']);
    assert.equal(chat.historial.at(-1).texto, '@claude ¿y tú?');
    assert.throws(() => new Chat({ ruta: base, carpeta: path.join(base, 'chats'), ia: 'gemini' }), /desconocida/);
  } finally { Object.assign(BIN, antes); }
});
