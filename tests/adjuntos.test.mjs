// Pruebas de los archivos que se pueden adjuntar a la terminal: extensión + contenido, y nombre saneado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clasificar, EXTENSIONES, MAX_ADJUNTO } from '../panel/lib/adjuntos.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]);
const PDF = Buffer.from('%PDF-1.7\n…');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);

test('admite imágenes, PDF, Office y texto si el contenido casa con la extensión', () => {
  assert.deepEqual(clasificar('Foto.PNG', PNG), { clase: 'imagen', nombre: 'Foto.png' });
  assert.deepEqual(clasificar('a.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0])), { clase: 'imagen', nombre: 'a.jpg' });
  assert.deepEqual(clasificar('factura.pdf', PDF), { clase: 'pdf', nombre: 'factura.pdf' });
  assert.deepEqual(clasificar('informe.docx', ZIP), { clase: 'office', nombre: 'informe.docx' });
  assert.deepEqual(clasificar('datos.csv', Buffer.from('año;niño\n1;2')), { clase: 'texto', nombre: 'datos.csv' });
  for (const e of ['png', 'pdf', 'xlsx', 'md', 'py']) assert.ok(EXTENSIONES.includes(e), e);
});

test('rechaza lo que no casa, lo desconocido, lo vacío y lo enorme', () => {
  assert.equal(clasificar('x.pdf', PNG), null);
  assert.equal(clasificar('x.docx', PDF), null);
  assert.equal(clasificar('x.txt', Buffer.from([0x61, 0, 0x62])), null);
  assert.equal(clasificar('x.txt', Buffer.from([0xc3, 0x28])), null); // UTF-8 inválido
  assert.equal(clasificar('x.exe', ZIP), null);
  assert.equal(clasificar('sinextension', PNG), null);
  assert.equal(clasificar('x.png', Buffer.alloc(0)), null);
  assert.equal(clasificar('x.txt', 'texto'), null);
  assert.equal(clasificar('x.txt', Buffer.alloc(MAX_ADJUNTO + 1, 0x61)), null);
});

test('el nombre queda sin rutas ni caracteres raros', () => {
  assert.equal(clasificar('../../etc/pass wd.txt', Buffer.from('a')).nombre, 'pass-wd.txt');
  assert.equal(clasificar('C:\\Users\\yo\\mi $(rm) archivo.md', Buffer.from('a')).nombre, 'mi-rm-archivo.md');
  assert.equal(clasificar('...txt', Buffer.from('a')).nombre, 'archivo.txt');
  assert.equal(clasificar(`${'a'.repeat(100)}.md`, Buffer.from('a')).nombre, `${'a'.repeat(60)}.md`);
});
