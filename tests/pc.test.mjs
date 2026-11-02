// Puente con el PC, lado del contenedor (scripts/pc.mjs): protocolo de una línea JSON con token.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { leerArgs, pedir } from '../scripts/pc.mjs';

/** Puente falso: guarda lo recibido y contesta lo que diga `responder`. */
function puente(responder) {
  const recibidas = [];
  const servidor = net.createServer((s) => {
    let b = '';
    s.setEncoding('utf8');
    s.on('data', (d) => {
      b += d;
      if (!b.includes('\n')) return;
      const p = JSON.parse(b.slice(0, b.indexOf('\n')));
      recibidas.push(p);
      const r = responder(p);
      if (r !== null) s.end(`${JSON.stringify(r)}\n`); else s.end();
    });
  });
  return new Promise((listo) => servidor.listen(0, '127.0.0.1', () => listo({ servidor, recibidas, env: { NULLRAPTOR_PUENTE: `127.0.0.1:${servidor.address().port}`, NULLRAPTOR_PUENTE_TOKEN: 't'.repeat(64) } })));
}

test('leerArgs: clave=valor; el valor puede llevar «=»', () => {
  assert.deepEqual(leerArgs(['url=https://a.b/?x=1', 'titulo=Hola']), { url: 'https://a.b/?x=1', titulo: 'Hola' });
  assert.throws(() => leerArgs(['suelto']), /clave=valor/);
});

test('pedir: manda token, orden y argumentos; devuelve el resultado o el error del puente', async () => {
  const { servidor, recibidas, env } = await puente((p) => (p.orden === 'estado' ? { ok: true, resultado: { puente: 'nullraptor' } } : { ok: false, error: 'Orden no permitida.' }));
  try {
    assert.deepEqual(await pedir('estado', { a: '1' }, { env }), { puente: 'nullraptor' });
    assert.deepEqual(recibidas[0], { token: 't'.repeat(64), orden: 'estado', args: { a: '1' } });
    await assert.rejects(pedir('borrar-todo', {}, { env }), /Orden no permitida/);
  } finally { servidor.close(); }
});

test('pedir: sin puente configurado, sin conexión o sin respuesta, un error claro', async () => {
  await assert.rejects(pedir('estado', {}, { env: {} }), /lanzador de Windows/);
  await assert.rejects(pedir('estado', {}, { env: { NULLRAPTOR_PUENTE: 'mal', NULLRAPTOR_PUENTE_TOKEN: 'x' } }), /no válido/);
  const { servidor, env } = await puente(() => null);
  try { await assert.rejects(pedir('estado', {}, { env }), /cerró sin contestar/); } finally { servidor.close(); }
  const libre = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
  await assert.rejects(pedir('estado', {}, { env: { NULLRAPTOR_PUENTE: `127.0.0.1:${libre}`, NULLRAPTOR_PUENTE_TOKEN: 'x' } }), /Sin conexión/);
});
