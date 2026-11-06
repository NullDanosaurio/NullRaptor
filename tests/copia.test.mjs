import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copiasEn, crearCopia, estado, generarClaves, origenesExistentes, proyectosSinSubir, restaurar, rotar } from '../scripts/copia.mjs';

const frase = 'caballo correcto batería grapa';

// Un «volumen» de mentira con lo que debe y no debe entrar, y el par de claves (la privada fuera del volumen).
function entorno() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'copia-'));
  const base = path.join(raiz, 'estado'), fuera = path.join(raiz, 'fuera');
  const poner = (ruta, texto) => { fs.mkdirSync(path.dirname(path.join(base, ruta)), { recursive: true }); fs.writeFileSync(path.join(base, ruta), texto); };
  poner('ruflo/tasks/store.json', '{"tareas":["a"]}');
  poner('trabajo/chats/uno.json', 'hola');
  poner('trabajo/memoria/nota.md', '# nota');
  poner('trabajo/registros/node_modules/x.js', 'no entra');
  poner('trabajo/registros/auth.json', 'SECRETO');
  poner('home/.claude/projects/-p/memory/MEMORY.md', '- memoria de Claude');
  poner('home/.claude/projects/-p/sesion.jsonl', 'conversación: no entra');
  poner('home/.claude/.credentials.json', 'SECRETO');
  poner('home/.nullraptor/passkeys.json', 'SECRETO');
  fs.mkdirSync(fuera);
  const privada = path.join(fuera, 'privada.pem'), publica = path.join(base, 'copias', 'clave-publica.pem');
  generarClaves({ privada, publica, frase, base });
  return { raiz, base, fuera, privada, publica };
}

test('origenesExistentes: solo lo que existe y la memoria de Claude, no sus conversaciones', () => {
  const { base } = entorno();
  assert.deepEqual(origenesExistentes(base).sort(), ['home/.claude/projects/-p/memory', 'ruflo', 'trabajo/chats', 'trabajo/memoria', 'trabajo/registros'].sort());
});

test('la clave privada no puede quedarse dentro del volumen y la frase debe ser larga', () => {
  const { base } = entorno();
  assert.throws(() => generarClaves({ privada: path.join(base, 'p.pem'), publica: path.join(base, 'q.pem'), frase, base }), /dentro del volumen/);
  assert.throws(() => generarClaves({ privada: '/tmp/x.pem', publica: '/tmp/y.pem', frase: 'corta', base }), /20 caracteres/);
});

test('copia y restauración: lo copiado vuelve igual, sin secretos ni dependencias, y el volumen no guarda la privada', async () => {
  const { base, fuera, privada } = entorno();
  const destino = path.join(base, 'copias');
  const r = await crearCopia({ base });
  assert.ok(fs.statSync(r.archivo).size > 0);
  assert.ok(!fs.readFileSync(r.archivo).includes('{"tareas"'), 'el archivo va cifrado');
  assert.ok(!fs.readdirSync(destino).some((n) => n.endsWith('.parcial')));
  assert.ok(!fs.readFileSync(path.join(destino, 'clave-publica.pem'), 'utf8').includes('PRIVATE'));

  const salida = path.join(fuera, 'restaurado');
  await restaurar({ copia: r.archivo, destino: salida, privada, frase });
  assert.equal(fs.readFileSync(path.join(salida, 'ruflo/tasks/store.json'), 'utf8'), '{"tareas":["a"]}');
  assert.equal(fs.readFileSync(path.join(salida, 'trabajo/memoria/nota.md'), 'utf8'), '# nota');
  assert.equal(fs.readFileSync(path.join(salida, 'home/.claude/projects/-p/memory/MEMORY.md'), 'utf8'), '- memoria de Claude');
  for (const no of ['trabajo/registros/node_modules/x.js', 'trabajo/registros/auth.json', 'home/.claude/.credentials.json', 'home/.nullraptor/passkeys.json', 'home/.claude/projects/-p/sesion.jsonl']) {
    assert.ok(!fs.existsSync(path.join(salida, no)), no);
  }
});

test('restaurar: frase errónea, copia alterada y destino con contenido se rechazan sin extraer nada', async () => {
  const { base, fuera, privada } = entorno();
  const r = await crearCopia({ base });
  await assert.rejects(restaurar({ copia: r.archivo, destino: path.join(fuera, 'a'), privada, frase: frase + 'x' }), /incorrectas/);
  assert.ok(!fs.existsSync(path.join(fuera, 'a')));

  const datos = fs.readFileSync(r.archivo); datos[datos.length >> 1] ^= 1;
  const alterada = path.join(fuera, 'copia-alterada.tar.gz.enc');
  fs.writeFileSync(alterada, datos);
  fs.copyFileSync(r.archivo.replace('.tar.gz.enc', '.json'), alterada.replace('.tar.gz.enc', '.json'));
  await assert.rejects(restaurar({ copia: alterada, destino: path.join(fuera, 'b'), privada, frase }), /alterada/);
  assert.ok(!fs.existsSync(path.join(fuera, 'b')), 'no se extrae nada si no se puede autenticar');

  fs.mkdirSync(path.join(fuera, 'c')); fs.writeFileSync(path.join(fuera, 'c', 'algo'), '1');
  await assert.rejects(restaurar({ copia: r.archivo, destino: path.join(fuera, 'c'), privada, frase }), /no está vacío/);
});

test('rotar deja las N más recientes (y sus .json) y estado informa de la última', async () => {
  const { base } = entorno();
  const destino = path.join(base, 'copias');
  for (const dia of ['01', '02', '03', '04']) await crearCopia({ base, ahora: new Date(`2026-11-${dia}T03:00:00Z`) });
  assert.equal(copiasEn(destino).length, 4);
  assert.equal(rotar(destino, 2).length, 2);
  assert.deepEqual(copiasEn(destino).map((n) => n.slice(6, 14)), ['20261104', '20261103']);
  assert.equal(fs.readdirSync(destino).filter((n) => n.endsWith('.json')).length, 2);
  assert.equal(rotar(destino, 0).length, 1, 'siempre se conserva al menos una');
  assert.deepEqual(estado(destino, new Date('2026-11-04T15:00:00Z')).horas, 12);
  assert.equal(estado(path.join(base, 'no-hay')).copias, 0);
});

test('proyectosSinSubir: avisa de cambios sin confirmar y de commits sin subir', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'sinsubir-'));
  const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd, stdio: 'ignore' });
  const remoto = path.join(raiz, 'remoto.git');
  git(raiz, 'init', '-q', '--bare', remoto);
  const trabajo = path.join(raiz, 'trabajo');
  for (const nombre of ['Limpio', 'Sucio', 'SinSubir']) {
    const p = path.join(trabajo, 'proyectos', nombre);
    fs.mkdirSync(p, { recursive: true });
    git(p, 'init', '-q', '-b', 'main');
    fs.writeFileSync(path.join(p, 'a.txt'), '1');
    git(p, 'add', '.'); git(p, 'commit', '-q', '-m', 'uno');
    git(p, 'remote', 'add', 'origin', remoto);
    git(p, 'push', '-q', '-u', 'origin', 'main:' + nombre);
  }
  fs.writeFileSync(path.join(trabajo, 'proyectos', 'Sucio', 'b.txt'), '2');
  fs.writeFileSync(path.join(trabajo, 'proyectos', 'SinSubir', 'c.txt'), '3');
  git(path.join(trabajo, 'proyectos', 'SinSubir'), 'add', '.');
  git(path.join(trabajo, 'proyectos', 'SinSubir'), 'commit', '-q', '-m', 'dos');
  assert.deepEqual(proyectosSinSubir(trabajo).sort((a, b) => a.proyecto.localeCompare(b.proyecto)), [
    { proyecto: 'SinSubir', sucios: 0, sinSubir: 1 },
    { proyecto: 'Sucio', sucios: 1, sinSubir: 0 },
  ]);
});

test('Copias (panel): sin clave avisa; con clave hace la copia la primera vez y no repite hasta que toca', async () => {
  const { base, raiz } = entorno();
  const { Copias } = await import('../panel/lib/copias.mjs');
  fs.rmSync(path.join(base, 'copias', 'clave-publica.pem'));
  let ahora = new Date('2026-11-06T03:00:00Z');
  const c = new Copias({ base, extra: path.join(raiz, 'extra'), ahora: () => ahora });
  assert.equal(c.estado().aviso, 'sin-clave');
  assert.equal(await c.revisar(), false);

  const { generarClaves: gen } = await import('../scripts/copia.mjs');
  gen({ privada: path.join(raiz, 'fuera', 'otra.pem'), publica: path.join(base, 'copias', 'clave-publica.pem'), frase, base });
  assert.equal(c.estado().aviso, 'atrasada', 'con clave pero sin copias ya hay que hacerla');
  assert.equal(await c.revisar(), true);
  assert.equal(c.estado().aviso, null);
  assert.equal(c.estado().copias, 1);
  assert.equal(copiasEn(path.join(raiz, 'extra')).length, 1, 'también copia fuera del volumen');
  assert.equal(await c.revisar(), false, 'no repite el mismo día');
  ahora = new Date('2026-11-07T04:00:00Z');
  assert.equal(await c.revisar(), true);
  assert.equal(c.estado().copias, 2);
  ahora = new Date('2026-11-10T04:00:00Z');
  assert.equal(c.estado().aviso, 'atrasada');
});

test('Copias (panel): refrescarSinSubir avisa de commits sin subir aunque no toque hacer la copia', async () => {
  const { base, raiz } = entorno();
  const { Copias } = await import('../panel/lib/copias.mjs');
  const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=a@b', '-c', 'user.name=t', ...a], { cwd, stdio: 'ignore' });
  const proyecto = path.join(base, 'trabajo', 'proyectos', 'Solo');
  fs.mkdirSync(proyecto, { recursive: true });
  git(proyecto, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(proyecto, 'a.txt'), 'a');
  git(proyecto, 'add', '.');
  git(proyecto, 'commit', '-q', '-m', 'uno');
  const c = new Copias({ base, extra: path.join(raiz, 'extra') });
  assert.deepEqual(c.estado().sinSubir, [], 'recién arrancado no sabe nada');
  c.refrescarSinSubir();
  assert.deepEqual(c.estado().sinSubir, [{ proyecto: 'Solo', sucios: 0, sinSubir: null }]);
});
