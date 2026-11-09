import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { limpiarMarcadores, marcadoresPresentes } from '../scripts/relevo-archivos.mjs';
import { entorno, nuevo } from './apoyo/remoto.mjs';

test('limpiarMarcadores: solo borra los vacíos que no existían antes; nunca un .git con contenido', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'marc-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.mkdirSync(path.join(d, '.codex')); // existía antes y vacío: se queda
  const antes = marcadoresPresentes(d);
  assert.deepEqual([...antes], ['.codex']);
  for (const n of ['.agents', '.aws']) fs.mkdirSync(path.join(d, n));
  fs.mkdirSync(path.join(d, '.git', 'objects'), { recursive: true }); // nuevo pero con contenido: se queda
  limpiarMarcadores(d, antes);
  assert.ok(!fs.existsSync(path.join(d, '.agents')) && !fs.existsSync(path.join(d, '.aws')));
  assert.ok(fs.existsSync(path.join(d, '.codex')) && fs.existsSync(path.join(d, '.git', 'objects')));
  fs.mkdirSync(path.join(d, '.git2'));
  const antes2 = marcadoresPresentes(d);
  limpiarMarcadores(d, antes2); // un .git que ya existía no se toca aunque se quedara vacío
  assert.ok(fs.existsSync(path.join(d, '.git')));
});

test('al cerrarse una sesión de Codex del panel se limpian las carpetas vacías que dejó el sandbox, y solo esas', (t) => {
  const e = entorno();
  t.after(() => fs.rmSync(e.base, { recursive: true, force: true }));
  const { remoto, lanzados } = nuevo(e);
  const proyecto = path.join(e.trabajo, 'proyectos', 'A');
  fs.mkdirSync(path.join(proyecto, '.codex')); // ya estaba
  remoto.abrir('A', { ia: 'codex' });
  for (const n of ['.aws', '.agents', '.git']) fs.mkdirSync(path.join(proyecto, n));
  fs.mkdirSync(path.join(proyecto, '.git2'));
  fs.writeFileSync(path.join(proyecto, '.agents', 'x'), 'con contenido');
  lanzados[0].emit('exit', 0);
  assert.ok(!fs.existsSync(path.join(proyecto, '.aws')) && !fs.existsSync(path.join(proyecto, '.git')));
  assert.ok(fs.existsSync(path.join(proyecto, '.agents', 'x')) && fs.existsSync(path.join(proyecto, '.codex')));
});
