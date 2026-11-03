// Voz del panel (panel/lib/voz.mjs): limpieza para hablar y gestor del servicio, contra un servicio falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { paraHablar, Voz } from '../panel/lib/voz.mjs';

test('paraHablar: sin Markdown, código ni direcciones', () => {
  assert.equal(paraHablar('## Hecho\n\n**Listo**, señor: `npm test` pasa.\n\n- uno\n- dos'), 'Hecho. Listo, señor: npm test pasa. uno dos');
  assert.equal(paraHablar('Mira [la nota](https://x.y/z) y https://a.b/c\n```js\nconst a = 1;\n```\nfin'), 'Mira la nota y un enlace (código omitido) fin');
});

function instalacion() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-'));
  fs.mkdirSync(path.join(dir, 'venv', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'modelos'));
  fs.writeFileSync(path.join(dir, 'venv', 'bin', 'python'), '');
  fs.writeFileSync(path.join(dir, 'modelos', 'kokoro-v1.0.onnx'), '');
  return dir;
}

test('Voz: sin instalar avisa; instalada, arranca el servicio una vez y le pasa audio y texto', async () => {
  assert.deepEqual(await new Voz({ dir: '/no/existe' }).estado(), { instalada: false, enMarcha: false });
  await assert.rejects(new Voz({ dir: '/no/existe' }).hablar('hola'), (e) => e.codigo === 503);

  const recibido = {};
  const servicio = http.createServer((req, res) => {
    const trozos = [];
    req.on('data', (t) => trozos.push(t));
    req.on('end', () => {
      const cuerpo = Buffer.concat(trozos);
      if (req.url === '/estado') { res.end('{"listo":true}'); return; }
      if (req.url === '/transcribir') { recibido.audio = cuerpo; recibido.idioma = req.headers['x-idioma']; res.end('{"texto":"hola, Jarvis"}'); return; }
      if (req.url === '/hablar') { recibido.texto = JSON.parse(cuerpo).texto; res.setHeader('Content-Type', 'audio/wav'); res.end('RIFF'); return; }
      res.statusCode = 404; res.end('{}');
    });
  });
  // El servicio «arranca» cuando el gestor llama a lanzar (antes no escucha).
  let lanzado = 0;
  const puerto = await new Promise((r) => { const s = http.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => r(port)); }); });
  const voz = new Voz({ dir: instalacion(), puerto, lanzar: () => { lanzado += 1; servicio.listen(puerto, '127.0.0.1'); return { exitCode: null, on() {}, kill() {} }; } });
  try {
    assert.deepEqual(await voz.estado(), { instalada: true, enMarcha: false });
    const [a, b] = await Promise.all([voz.transcribir(Buffer.from('audio'), 'es'), voz.transcribir(Buffer.from('audio'), 'mal!')]);
    assert.deepEqual(a, { texto: 'hola, Jarvis' });
    assert.deepEqual(b, a);
    assert.equal(lanzado, 1);
    assert.equal(recibido.idioma, 'es');
    assert.equal((await voz.hablar('**Hola**, señor')).toString(), 'RIFF');
    assert.equal(recibido.texto, 'Hola, señor');
    assert.deepEqual(await voz.estado(), { instalada: true, enMarcha: true });
    await assert.rejects(voz.transcribir(Buffer.alloc(0)), (e) => e.codigo === 400);
  } finally { servicio.close(); }
});
