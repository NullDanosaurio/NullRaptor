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

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preparar, terminar } from '../scripts/pc.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));

test('ejecutar: el script llega por la entrada estándar; sale con el código del PC (124 si se agota)', () => {
  assert.deepEqual(preparar('ejecutar', { cwd: 'C:\\x' }, { leerEntrada: () => 'Get-Date\n' }), { cwd: 'C:\\x', script: 'Get-Date\n' });
  assert.deepEqual(preparar('ejecutar', { script: 'dir' }, { leerEntrada: () => { throw new Error('no se lee'); } }), { script: 'dir' });
  assert.throws(() => preparar('ejecutar', {}, { leerEntrada: () => '  ' }), /Falta el script/);
  assert.deepEqual(terminar('ejecutar', {}, { codigo: 3, salida: 'hola', errores: 'mal', agotado: false }), { salida: 'hola', errores: 'mal', codigo: 3 });
  assert.equal(terminar('ejecutar', {}, { codigo: null, salida: '', errores: '', agotado: true }).codigo, 124);
});

test('enviar y traer: el archivo local va y vuelve en base64; las rutas locales no viajan al PC', () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.stl'), Buffer.from([0, 1, 2, 255]));
  const ida = preparar('enviar', { origen: path.join(d, 'a.stl'), destino: 'C:\\M\\a.stl' });
  assert.deepEqual(ida, { destino: 'C:\\M\\a.stl', datos: 'AAEC/w==' });
  assert.deepEqual(preparar('traer', { origen: 'C:\\M\\b.gcode', destino: path.join(d, 'x', 'b.gcode') }), { origen: 'C:\\M\\b.gcode' });
  const fin = terminar('traer', { destino: path.join(d, 'x', 'b.gcode') }, { origen: 'C:\\M\\b.gcode', bytes: 4, datos: 'AAEC/w==' });
  assert.deepEqual([...fs.readFileSync(path.join(d, 'x', 'b.gcode'))], [0, 1, 2, 255]);
  assert.equal(JSON.parse(fin.salida).bytes, 4);
  assert.throws(() => preparar('enviar', { origen: 'x' }), /Uso/);
});

test('captura: el PNG se guarda en disco y la salida dice dónde y cómo pasar a coordenadas de pantalla', () => {
  const d = tmp();
  const png = Buffer.from('89504e47', 'hex').toString('base64');
  const fin = terminar('captura', { salida: path.join(d, 'c.png') }, { x: -1920, y: 0, ancho: 3840, alto: 1080, escala: 0.4166, png });
  const s = JSON.parse(fin.salida);
  assert.equal(s.archivo, path.join(d, 'c.png'));
  assert.equal(s.png, undefined);
  assert.equal(s.x, -1920);
  assert.equal(fs.readFileSync(path.join(d, 'c.png')).toString('hex'), '89504e47');
  assert.deepEqual(preparar('captura', { salida: 'c.png', ventana: 'Elegoo' }), { ventana: 'Elegoo' });
});
