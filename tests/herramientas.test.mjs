// Pruebas del centro de herramientas: ficha, validaciones y listado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  aprobar, archivoAprobaciones, archivosDe, carpetaHerramientas, configHerramientas, desactivar, herramientaLanzable, herramientasActivas, huella,
  leerFicha, listarHerramientas, verArchivo,
} from '../scripts/herramientas.mjs';

function entorno() {
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'herramientas-'));
  const base = path.join(trabajo, 'herramientas');
  fs.mkdirSync(base);
  return { trabajo, base };
}

function herramienta(base, id, ficha, archivos = { 'servidor.mjs': '// servidor\n' }) {
  const dir = path.join(base, id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, c] of Object.entries(archivos)) { fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true }); fs.writeFileSync(path.join(dir, n), c); }
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
  const lista = listarHerramientas({ trabajo, env: { HOME: trabajo } });
  assert.deepEqual(lista.map((h) => [h.id, h.origen, Boolean(h.error)]), [['ruflo', 'imagen', false], ['alfa', 'propia', true], ['zeta', 'propia', false]]);
  assert.deepEqual(listarHerramientas({ trabajo: path.join(trabajo, 'no-existe'), env: { HOME: trabajo } }).map((h) => h.id), ['ruflo']);
});

test('aprobación: propuesta → aprobada con huella; si cambia un archivo, «cambiada»; desactivar la retira', () => {
  const { trabajo, base } = entorno();
  const env = { HOME: path.join(trabajo, 'casa') };
  const dir = herramienta(base, 'tiempo', buena());
  herramienta(base, 'rota', { ...buena(), tipo: 'otro' });
  const estado = () => Object.fromEntries(listarHerramientas({ trabajo, env }).map((h) => [h.id, h.estado]));
  assert.deepEqual(estado(), { ruflo: 'activa', rota: 'no válida', tiempo: 'propuesta' });
  assert.deepEqual(herramientasActivas({ trabajo, env }), []);

  const { huella: firma } = aprobar({ trabajo, env, id: 'tiempo', quien: 'iPhone' });
  assert.equal(firma, huella(dir));
  assert.equal(estado().tiempo, 'aprobada');
  assert.deepEqual(herramientasActivas({ trabajo, env }).map((h) => h.id), ['tiempo']);
  assert.equal((fs.statSync(archivoAprobaciones(env)).mode & 0o777), 0o600);

  // Un cambio en cualquier archivo (también uno nuevo) la saca de las activas hasta volver a aprobarla.
  fs.writeFileSync(path.join(dir, 'servidor.mjs'), '// otra cosa\n');
  assert.equal(estado().tiempo, 'cambiada');
  assert.deepEqual(herramientasActivas({ trabajo, env }), []);
  aprobar({ trabajo, env, id: 'tiempo' });
  fs.mkdirSync(path.join(dir, 'lib'));
  fs.writeFileSync(path.join(dir, 'lib', 'extra.mjs'), '');
  assert.equal(estado().tiempo, 'cambiada');

  assert.equal(desactivar({ env, id: 'tiempo' }), true);
  assert.equal(desactivar({ env, id: 'tiempo' }), false);
  assert.equal(estado().tiempo, 'propuesta');

  assert.throws(() => aprobar({ trabajo, env, id: 'rota' }), (e) => e.codigo === 400);
  assert.throws(() => aprobar({ trabajo, env, id: 'no-existe' }), (e) => e.codigo === 404);
  assert.throws(() => aprobar({ trabajo, env, id: 'ruflo' }), (e) => e.codigo === 400);
});

test('huella: no sigue enlaces simbólicos (cuenta su destino) y no depende del orden de creación', (t) => {
  const { trabajo } = entorno();
  const a = path.join(trabajo, 'a');
  const b = path.join(trabajo, 'b');
  for (const [dir, orden] of [[a, ['x', 'y']], [b, ['y', 'x']]]) {
    fs.mkdirSync(dir);
    for (const n of orden) fs.writeFileSync(path.join(dir, n), n);
  }
  assert.equal(huella(a), huella(b));
  try { fs.symlinkSync('/etc/hostname', path.join(a, 'enlace')); } catch { t.skip('sin enlaces simbólicos'); return; }
  const con = huella(a);
  fs.rmSync(path.join(a, 'enlace'));
  fs.symlinkSync('/etc/hosts', path.join(a, 'enlace'));
  assert.notEqual(huella(a), con);
});

test('aprobar con la huella revisada: si cambió entretanto, 409 y sigue sin aprobar', () => {
  const { trabajo, base } = entorno();
  const env = { HOME: path.join(trabajo, 'casa') };
  const dir = herramienta(base, 'tiempo', buena());
  const vista = listarHerramientas({ trabajo, env }).find((h) => h.id === 'tiempo');
  assert.equal(vista.huella, huella(dir));
  fs.writeFileSync(path.join(dir, 'servidor.mjs'), '// colado después de revisar\n');
  assert.throws(() => aprobar({ trabajo, env, id: 'tiempo', esperada: vista.huella }), (e) => e.codigo === 409);
  assert.equal(listarHerramientas({ trabajo, env }).find((h) => h.id === 'tiempo').estado, 'propuesta');
  aprobar({ trabajo, env, id: 'tiempo', esperada: huella(dir) });
  assert.equal(listarHerramientas({ trabajo, env }).find((h) => h.id === 'tiempo').estado, 'aprobada');
});

test('revisar: lista de archivos y texto, sin salir de la carpeta ni seguir enlaces', (t) => {
  const { trabajo, base } = entorno();
  const dir = herramienta(base, 'tiempo', buena(), { 'servidor.mjs': 'hola', 'lib/x.mjs': '' });
  assert.deepEqual(archivosDe({ trabajo, env: {}, id: 'tiempo' }).archivos.map((a) => a.ruta), ['herramienta.json', 'lib/x.mjs', 'servidor.mjs']);
  assert.equal(verArchivo({ trabajo, env: {}, id: 'tiempo', ruta: 'servidor.mjs' }).texto, 'hola');
  for (const ruta of ['../tiempo/servidor.mjs', '/etc/passwd', 'lib/../../x', '']) assert.throws(() => verArchivo({ trabajo, env: {}, id: 'tiempo', ruta }), (e) => e.codigo === 400, ruta);
  assert.throws(() => verArchivo({ trabajo, env: {}, id: 'tiempo', ruta: 'nada' }), (e) => e.codigo === 404);
  assert.throws(() => verArchivo({ trabajo, env: {}, id: 'tiempo', ruta: 'lib' }), (e) => e.codigo === 400);
  try { fs.symlinkSync('/etc/hostname', path.join(dir, 'enlace')); } catch { t.skip('sin enlaces simbólicos'); return; }
  assert.throws(() => verArchivo({ trabajo, env: {}, id: 'tiempo', ruta: 'enlace' }), (e) => e.codigo === 400);
  assert.deepEqual(archivosDe({ trabajo, env: {}, id: 'tiempo' }).archivos.find((a) => a.ruta === 'enlace'), { ruta: 'enlace', enlace: '/etc/hostname' });
});

test('config MCP: solo las aprobadas, con el lanzador y sus variables del cofre; sin la obligatoria, fuera', () => {
  const { trabajo, base } = entorno();
  const env = { HOME: path.join(trabajo, 'casa'), TIEMPO_CLAVE: 'k', GITHUB_TOKEN: 'gh' };
  herramienta(base, 'tiempo', buena({ variables: [{ nombre: 'TIEMPO_CLAVE', obligatoria: true }, { nombre: 'TIEMPO_OPCIONAL' }] }));
  herramienta(base, 'mapas', buena({ variables: [{ nombre: 'MAPAS_CLAVE', obligatoria: true }] }));
  herramienta(base, 'nueva', buena());
  aprobar({ trabajo, env, id: 'tiempo' });
  aprobar({ trabajo, env, id: 'mapas' });
  const c = configHerramientas({ agente: '/agente', trabajo, env });
  assert.deepEqual(Object.keys(c), ['herramienta-tiempo']); // mapas sin su clave; nueva sin aprobar
  assert.deepEqual(c['herramienta-tiempo'].args, [path.join('/agente', 'scripts', 'herramienta-mcp.mjs'), 'tiempo']);
  assert.deepEqual(c['herramienta-tiempo'].env, { TRABAJO_DIR: path.resolve(trabajo), HOME: env.HOME, TIEMPO_CLAVE: 'k' });
  assert.throws(() => herramientaLanzable({ trabajo, env, id: 'nueva' }), /propuesta/);
  assert.throws(() => herramientaLanzable({ trabajo, env, id: 'ruflo' }), /no existe/);
});
