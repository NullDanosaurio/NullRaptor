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
import { createHash } from 'node:crypto';
import { enviarArchivo, preparar, terminar, traerArchivo } from '../scripts/pc.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));

test('ejecutar: el script llega por la entrada estándar; sale con el código del PC (124 si se agota)', () => {
  assert.deepEqual(preparar('ejecutar', { cwd: 'C:\\x' }, { leerEntrada: () => 'Get-Date\n' }), { cwd: 'C:\\x', script: 'Get-Date\n' });
  assert.deepEqual(preparar('ejecutar', { script: 'dir' }, { leerEntrada: () => { throw new Error('no se lee'); } }), { script: 'dir' });
  assert.throws(() => preparar('ejecutar', {}, { leerEntrada: () => '  ' }), /Falta el script/);
  assert.deepEqual(terminar('ejecutar', {}, { codigo: 3, salida: 'hola', errores: 'mal', agotado: false }), { salida: 'hola', errores: 'mal', codigo: 3 });
  assert.equal(terminar('ejecutar', {}, { codigo: null, salida: '', errores: '', agotado: true }).codigo, 124);
});

/** Puente falso por trozos, con la misma lógica que puente.ps1 (enviar/traer), sobre un «disco» en memoria. */
function puenteTrozos({ dañar = false } = {}) {
  const disco = new Map();
  const sha = (b) => createHash('sha256').update(b).digest('hex');
  const peticiones = [];
  return {
    disco, peticiones,
    pedirA: async (orden, a) => {
      peticiones.push([orden, a.posicion]);
      if (orden === 'enviar') {
        const previo = a.posicion === 0 ? Buffer.alloc(0) : disco.get(`${a.destino}.parcial`);
        if (previo.length !== a.posicion) throw new Error('posición');
        const nuevo = Buffer.concat([previo, Buffer.from(a.datos, 'base64')]);
        disco.set(`${a.destino}.parcial`, nuevo);
        if (!a.final) return { recibido: nuevo.length };
        disco.delete(`${a.destino}.parcial`);
        disco.set(a.destino, nuevo);
        return { destino: a.destino, bytes: nuevo.length, sha256: dañar ? 'x' : sha(nuevo) };
      }
      const todo = disco.get(a.origen);
      const parte = todo.subarray(a.posicion, a.posicion + a.tamano);
      const r = { origen: a.origen, total: todo.length, posicion: a.posicion, datos: (dañar ? Buffer.from('zz') : parte).toString('base64') };
      if (a.posicion + parte.length >= todo.length) r.sha256 = sha(todo);
      return r;
    },
  };
}

test('enviar y traer: por trozos, de ida y vuelta, y comprobados con SHA-256 (también vacíos)', async () => {
  const d = tmp();
  for (const tam of [0, 5, 16, 17, 100]) {
    const datos = Buffer.from(Array.from({ length: tam }, (_, i) => (i * 7) % 256));
    fs.writeFileSync(path.join(d, 'a.bin'), datos);
    const p = puenteTrozos();
    const ida = await enviarArchivo(path.join(d, 'a.bin'), 'C:\\M\\a.bin', { pedirA: p.pedirA, trozo: 16 });
    assert.equal(ida.bytes, tam);
    assert.deepEqual(p.disco.get('C:\\M\\a.bin'), datos);
    assert.equal(p.peticiones.length, Math.max(1, Math.ceil(tam / 16)));
    const vuelta = await traerArchivo('C:\\M\\a.bin', path.join(d, 'x', 'b.bin'), { pedirA: p.pedirA, trozo: 16 });
    assert.equal(vuelta.sha256, ida.sha256);
    assert.deepEqual(fs.readFileSync(path.join(d, 'x', 'b.bin')), datos);
    assert.ok(!fs.existsSync(path.join(d, 'x', 'b.bin.parcial')));
  }
});

test('enviar y traer: si llega distinto, error y no queda el archivo a medias', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.bin'), 'hola mundo');
  await assert.rejects(enviarArchivo(path.join(d, 'a.bin'), 'C:\\a', { pedirA: puenteTrozos({ dañar: true }).pedirA }), /llegó distinto/);
  const p = puenteTrozos({ dañar: true });
  p.disco.set('C:\\b', Buffer.from('hola'));
  await assert.rejects(traerArchivo('C:\\b', path.join(d, 'b.bin'), { pedirA: p.pedirA }), /dañado/);
  assert.ok(!fs.existsSync(path.join(d, 'b.bin')) && !fs.existsSync(path.join(d, 'b.bin.parcial')));
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
