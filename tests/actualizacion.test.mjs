// Actualización automática: lo que el panel publica para la tarea de Windows y el botón «Actualizar ahora».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Actualizacion } from '../panel/lib/actualizacion.mjs';
import { crearServidor } from '../panel/servidor.mjs';

const IMAGEN = `sha256:${'a'.repeat(64)}`;
const nueva = () => {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'actualizacion-'));
  return { trabajo, a: new Actualizacion({ trabajo, ahora: () => new Date('2026-10-31T12:00:00Z') }) };
};
const escribir = (trabajo, nombre, datos) => {
  fs.mkdirSync(path.join(trabajo, 'actualizacion'), { recursive: true });
  fs.writeFileSync(path.join(trabajo, 'actualizacion', nombre), typeof datos === 'string' ? datos : JSON.stringify(datos));
};

test('publica las sesiones abiertas; sin versión nueva no se puede pedir', () => {
  const { trabajo, a } = nueva();
  a.publicar(2);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(trabajo, 'actualizacion', 'panel.json'), 'utf8')), { sesiones: 2, fecha: '2026-10-31T12:00:00.000Z' });
  assert.deepEqual(a.estado(), { disponible: null, solicitada: null });
  assert.throws(() => a.solicitar('yo'), (e) => e.codigo === 409);
});

test('versión nueva que deja la tarea; «Actualizar ahora» queda anotado', () => {
  const { trabajo, a } = nueva();
  escribir(trabajo, 'disponible.json', { imagen: IMAGEN, fecha: '2026-10-31T11:55:00Z' });
  assert.deepEqual(a.estado(), { disponible: { imagen: IMAGEN, fecha: '2026-10-31T11:55:00Z' }, solicitada: null });
  assert.deepEqual(a.solicitar('iPhone'), { solicitada: '2026-10-31T12:00:00.000Z' });
  assert.equal(a.estado().solicitada, '2026-10-31T12:00:00.000Z');
  // Un archivo raro no cuenta como versión nueva (ni arrastra una solicitud vieja).
  for (const malo of ['{roto', { imagen: 'latest' }, { imagen: 5 }]) {
    escribir(trabajo, 'disponible.json', malo);
    assert.deepEqual(a.estado(), { disponible: null, solicitada: null });
  }
});

test('API: estado y botón, con la cabecera del panel', async (t) => {
  const { trabajo, a } = nueva();
  const servidor = crearServidor({ trabajo, memoria: null, actualizacion: a });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => servidor.close());
  const { port } = servidor.address();
  const pedir = (metodo, ruta, cab = {}) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, method: metodo, path: ruta, headers: { host: `localhost:${port}`, 'content-type': 'application/json', ...cab } }, (res) => {
      let d = '';
      res.on('data', (x) => { d += x; });
      res.on('end', () => resolve({ estado: res.statusCode, datos: JSON.parse(d) }));
    });
    r.on('error', reject);
    r.end(metodo === 'POST' ? '{}' : undefined);
  });
  // Al arrancar ya publica (sin sesiones).
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, 'actualizacion', 'panel.json'), 'utf8')).sesiones, 0);
  assert.deepEqual((await pedir('GET', '/api/actualizacion')).datos, { disponible: null, solicitada: null });
  assert.equal((await pedir('POST', '/api/actualizacion/ahora', { 'x-nullraptor': '1' })).estado, 409);
  escribir(trabajo, 'disponible.json', { imagen: IMAGEN, fecha: 'x' });
  assert.equal((await pedir('POST', '/api/actualizacion/ahora')).estado, 403); // sin cabecera: CSRF
  const ok = await pedir('POST', '/api/actualizacion/ahora', { 'x-nullraptor': '1' });
  assert.equal(ok.estado, 200);
  assert.equal(JSON.parse(fs.readFileSync(path.join(trabajo, 'actualizacion', 'solicitada.json'), 'utf8')).quien, 'este equipo');
});
