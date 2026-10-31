// Pruebas del centro de herramientas: ficha, validaciones y listado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carpetaHerramientas, leerFicha, listarHerramientas } from '../scripts/herramientas.mjs';

function entorno() {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'herramientas-'));
  const base = path.join(trabajo, 'herramientas');
  fs.mkdirSync(base);
  return { trabajo, base };
}

function herramienta(base, id, ficha, archivos = { 'servidor.mjs': '// servidor\n' }) {
  const dir = path.join(base, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, n), c);
  if (ficha !== undefined) fs.writeFileSync(path.join(dir, 'herramienta.json'), typeof ficha === 'string' ? ficha : JSON.stringify(ficha));
  return dir;
}

const buena = (extra = {}) => ({ nombre: 'Tiempo', descripcion: 'Previsión', tipo: 'mcp', mcp: { script: 'servidor.mjs', ...extra } });

test('carpeta: $TRABAJO_DIR/herramientas salvo HERRAMIENTAS_DIR', () => {
  assert.equal(carpetaHerramientas('/t', {}), path.resolve('/t/herramientas'));
  assert.equal(carpetaHerramientas('/t', { HERRAMIENTAS_DIR: '/h' }), path.resolve('/h'));
});

test('ficha válida: script dentro de la carpeta, argumentos y variables', () => {
  const { base } = entorno();
  herramienta(base, 'tiempo', buena({ args: ['--rapido'], variables: [{ nombre: 'TIEMPO_CLAVE', obligatoria: true, secreta: true }] }));
  const h = leerFicha(base, 'tiempo');
  assert.equal(h.nombre, 'Tiempo');
  assert.equal(h.origen, 'propia');
  assert.equal(h.mcp.script, path.join(fs.realpathSync(base), 'tiempo', 'servidor.mjs'));
  assert.deepEqual(h.mcp.args, ['--rapido']);
  assert.deepEqual(h.mcp.variables, [{ nombre: 'TIEMPO_CLAVE', obligatoria: true, secreta: true }]);
});

test('fichas no válidas: cada una con su motivo', () => {
  const { base } = entorno();
  const casos = {
    'sin-ficha': [undefined, /ausente/],
    'json-roto': ['{roto', /mal escrito/],
    'sin-nombre': [{ ...buena(), nombre: ' ' }, /nombre/],
    'otro-tipo': [{ ...buena(), tipo: 'panel' }, /tipo/],
    'script-absoluto': [buena({ script: '/etc/passwd.js' }), /relativo/],
    'script-fuera': [buena({ script: '../otra/servidor.mjs' }), /sale de la carpeta|no existe/],
    'script-falta': [buena({ script: 'nada.mjs' }), /no existe/],
    'script-no-js': [buena({ script: 'servidor.sh' }), /\.mjs/],
    'args-raros': [buena({ args: [1] }), /args/],
    'var-rara': [buena({ variables: [{ nombre: 'x y' }] }), /variable no válida/],
    'roba-token': [buena({ variables: [{ nombre: 'GITHUB_TOKEN' }] }), /credencial del agente/],
  };
  for (const [id, [ficha, motivo]] of Object.entries(casos)) {
    herramienta(base, id, ficha);
    assert.throws(() => leerFicha(base, id), motivo, id);
  }
  assert.throws(() => leerFicha(base, 'Mayusculas'), /minúsculas/);
});

test('un enlace simbólico no saca el script ni la carpeta fuera', (t) => {
  const { trabajo, base } = entorno();
  const fuera = path.join(trabajo, 'fuera');
  fs.mkdirSync(fuera);
  fs.writeFileSync(path.join(fuera, 'malo.mjs'), '');
  const dir = herramienta(base, 'enlace', buena({ script: 'malo.mjs' }), {});
  try {
    fs.symlinkSync(path.join(fuera, 'malo.mjs'), path.join(dir, 'malo.mjs'));
    fs.symlinkSync(fuera, path.join(base, 'carpeta-fuera'));
  } catch { t.skip('sin enlaces simbólicos'); return; }
  assert.throws(() => leerFicha(base, 'enlace'), /sale de la carpeta/);
  assert.throws(() => leerFicha(base, 'carpeta-fuera'), /fuera de las herramientas/);
});

test('listado: Ruflo de la imagen primero; las propias por orden, con error si no valen', () => {
  const { trabajo, base } = entorno();
  herramienta(base, 'zeta', buena());
  herramienta(base, 'alfa', { ...buena(), tipo: 'otro' });
  fs.mkdirSync(path.join(base, '.oculta'));
  const lista = listarHerramientas({ trabajo, env: {} });
  assert.deepEqual(lista.map((h) => [h.id, h.origen, Boolean(h.error)]), [['ruflo', 'imagen', false], ['alfa', 'propia', true], ['zeta', 'propia', false]]);
  assert.deepEqual(listarHerramientas({ trabajo: path.join(trabajo, 'no-existe'), env: {} }).map((h) => h.id), ['ruflo']);
});
