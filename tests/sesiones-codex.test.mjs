// Desarrollo persistente en la terminal compartida; los chats exec no aparecen en el historial.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { entorno, nuevo } from './apoyo/remoto.mjs';
import { registrarRelevoCodex, sesionesCodex } from '../scripts/sesiones-codex.mjs';
import { Actualizacion } from '../panel/lib/actualizacion.mjs';
import TOML from '@iarna/toml';
import { EventEmitter } from 'node:events';
import { abrirCodex } from '../scripts/codex.mjs';

const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
function preparar(t) {
  const e = entorno();
  t.after(() => fs.rmSync(e.base, { recursive: true, force: true }));
  const r = nuevo(e);
  const dir = path.join(e.base, '.codex', 'sessions', '2026', '11', '06');
  fs.mkdirSync(dir, { recursive: true });
  const guardar = (id, proyecto, source, fecha = '2026-11-06T12:00:00Z') => {
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), JSON.stringify({ type: 'session_meta', payload: {
      id, cwd: path.join(e.trabajo, 'proyectos', proyecto), timestamp: fecha, source,
    } }) + '\n');
  };
  return { ...e, ...r, guardar, dir };
}

test('Codex abre la terminal con MCP, skills y Director adaptados; Claude sigue siendo el predeterminado', (t) => {
  const { remoto, lanzados, trabajo } = preparar(t);
  const s = remoto.abrir('A', { ia: 'codex' });
  assert.equal(s.ia, 'codex');
  assert.equal(s.estado, 'conectada');
  const h = lanzados[0];
  assert.equal(h.opciones.cwd, path.join(trabajo, 'proyectos', 'A'));
  assert.equal(h.opciones.ia, 'codex');
  assert.equal(h.opciones.env.AGENTE_CLAVE, undefined);
  assert.ok(h.args.includes('--no-daemon'));
  assert.ok(!h.args.includes('--sandbox'));
  assert.ok(h.args.includes('default_permissions="nr"'));
  assert.equal(h.args[h.args.indexOf('--ask-for-approval') + 1], 'on-request');
  remoto.escribir(s.id, 'Modifica el proyecto\r');
  assert.equal(h.stdin.read(), 'Modifica el proyecto\r');
  const director = remoto.abrir('C', { ia: 'codex', perfil: 'director', aviso: 'Recupera el estado de Ruflo' });
  assert.equal(director.perfil, 'director');
  assert.ok(lanzados[1].args.some((a) => a.includes('Perfil: Director IA')));
  assert.deepEqual(lanzados[1].args.slice(-2), ['--', 'Recupera el estado de Ruflo']);
  assert.ok(h.args.some((a) => a.startsWith('mcp_servers=') && a.includes('ruflo') && a.includes('context7')));
  assert.ok(fs.existsSync(path.join(lanzados[0].opciones.env.HOME, '.agents', 'skills', 'nullraptor-pc', 'SKILL.md')));
  assert.throws(() => remoto.abrir('B', { ia: 'codex', perfil: '../../fuera' }), { codigo: 400 });
  assert.throws(() => remoto.abrir('B', { ia: 'otra' }), { codigo: 400 });
  assert.equal(remoto.abrir('B').ia, 'claude');
  t.after(() => remoto.cerrarTodas());
});

test('historial nativo tras reinicio: reanudar ID exacto y excluir chats, otros proyectos y rutas arbitrarias', (t) => {
  const { remoto, lanzados, guardar, dir } = preparar(t);
  guardar(ids[0], 'A', 'cli');
  guardar(ids[1], 'A', 'exec', '2026-11-06T13:00:00Z'); // consulta más reciente
  guardar(ids[2], 'B', 'cli');
  fs.writeFileSync(path.join(dir, 'roto.jsonl'), '{');
  assert.equal(sesionesCodex(remoto.env).length, 3);
  assert.deepEqual(remoto.historialCodex('A').map((s) => s.id), [ids[0]]);
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: ids[2] }), { codigo: 404 });
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: '../fuera' }), { codigo: 404 });
  assert.throws(() => remoto.abrir('C', { ia: 'codex', continuar: true }), { codigo: 404 });
  const s = remoto.abrir('A', { ia: 'codex', continuar: true });
  assert.equal(s.sesionCodex, ids[0]);
  assert.deepEqual(lanzados[0].args.slice(-2), ['resume', ids[0]]);
  assert.ok(!lanzados[0].args.includes('--last'));
  t.after(() => remoto.cerrarTodas());
});

test('relevos terminados e interrumpidos se retoman; el índice conserva relevos anteriores y bloquea escritores simultáneos', (t) => {
  const { remoto, trabajo, guardar } = preparar(t);
  guardar(ids[0], 'A', 'exec');
  registrarRelevoCodex(trabajo, { id: ids[0], cwd: path.join(trabajo, 'proyectos', 'A'), proyecto: 'A' });
  assert.equal(remoto.historialCodex('A')[0].relevo, true);
  const dir = path.join(trabajo, '.relevo');
  fs.mkdirSync(dir);
  const estado = path.join(dir, 'A.estado.json');
  fs.writeFileSync(estado, JSON.stringify({ estado: 'en curso', pid: process.pid, sesionCodex: ids[0] }));
  assert.equal(remoto.historialCodex('A')[0].enCurso, true);
  assert.throws(() => remoto.abrir('A', { ia: 'codex', sesionCodex: ids[0] }), { codigo: 409 });
  assert.throws(() => remoto.abrir('A'), { codigo: 409 });
  fs.writeFileSync(estado, JSON.stringify({ estado: 'en curso', pid: 2 ** 22 + 12345, sesionCodex: ids[0] }));
  assert.equal(remoto.historialCodex('A')[0].enCurso, false);
  assert.equal(remoto.abrir('A', { ia: 'codex', sesionCodex: ids[0] }).sesionCodex, ids[0]);
  t.after(() => remoto.cerrarTodas());
});

test('reinicio del panel conserva el motor de cada proyecto', (t) => {
  const { trabajo } = preparar(t);
  const a = new Actualizacion({ trabajo });
  a.guardarReanudar(['A', 'B'], {}, { A: 'codex', B: 'claude' }, { A: ids[0] });
  assert.deepEqual(a.tomarReanudar(), [{ proyecto: 'A', perfil: null, ia: 'codex', sesionCodex: ids[0] }, { proyecto: 'B', perfil: null }]);
});

function configDe(args) {
  return Object.assign({}, ...args.flatMap((arg, i) => arg === '-c' ? [TOML.parse(args[i + 1])] : []));
}

test('Codex refresca autorizaciones al abrir y reanudar, conserva el aviso y no arranca si falla la preparación', async (t) => {
  const { base, trabajo, configDir, guardar } = preparar(t);
  const estadoMcp = path.join(base, 'memoria', 'MCP');
  fs.mkdirSync(estadoMcp, { recursive: true });
  const estado = (instalados) => fs.writeFileSync(path.join(estadoMcp, 'estado.json'), JSON.stringify({ instalados }));
  const ficha = { id: 'mcp-prueba', instalacion: { tipo: 'npm', paquete: 'prueba', version: '1.0.0', variables: [] } };
  const { remoto, lanzados } = nuevo({ base, trabajo, configDir }, { memoria: path.join(base, 'memoria') });
  t.after(() => remoto.cerrarTodas());
  estado([ficha]);
  const s = remoto.abrir('A', { ia: 'codex' });
  assert.ok(configDe(lanzados[0].args).mcp_servers['mcp-prueba']);
  const reglas = configDe(lanzados[0].args).developer_instructions;
  assert.equal(lanzados[0].opciones.env.CODEX_HOME, undefined); // No se cambia la cuenta ni su historial.
  await remoto.cerrar(s.id);
  guardar(ids[0], 'A', 'cli');
  estado([]);
  remoto.abrir('A', { ia: 'codex', sesionCodex: ids[0], aviso: 'Recupera las tareas compartidas' });
  assert.equal(configDe(lanzados[1].args).mcp_servers['mcp-prueba'], undefined);
  assert.equal(configDe(lanzados[1].args).developer_instructions, reglas);
  assert.deepEqual(lanzados[1].args.slice(-4), ['resume', ids[0], '--', 'Recupera las tareas compartidas']);
  const fallo = nuevo({ base, trabajo, configDir }, { prepararMcp: () => { throw new Error('MCP roto'); } });
  assert.throws(() => fallo.remoto.abrir('B', { ia: 'codex' }), { codigo: 503 });
  assert.equal(fallo.lanzados.length, 0);
});

test('la entrada de terminal prepara el mismo flujo sin cambiar la cuenta ni pasar la clave del cofre', async (t) => {
  const { base, trabajo } = preparar(t);
  let lanzamiento;
  const hijo = new EventEmitter();
  const env = { HOME: base, TRABAJO_DIR: trabajo, AGENTE_CLAVE: 'no-pasar' };
  const pendiente = abrirCodex(path.join(trabajo, 'proyectos', 'A'), { env, adicionales: ['resume', ids[0]],
    arrancar: (binario, args, opciones) => { lanzamiento = { binario, args, opciones }; return hijo; } });
  const config = configDe(lanzamiento.args);
  assert.ok(config.mcp_servers.ruflo);
  assert.ok(config.mcp_servers.context7);
  assert.match(config.developer_instructions, /incluso al reanudar/);
  assert.deepEqual(lanzamiento.args.slice(-2), ['resume', ids[0]]);
  assert.equal(lanzamiento.opciones.env.AGENTE_CLAVE, undefined);
  assert.equal(lanzamiento.opciones.env.HOME, base);
  hijo.emit('exit', 0);
  assert.equal(await pendiente, 0);
});
