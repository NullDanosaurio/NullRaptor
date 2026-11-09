// Ciclo entre clientes reales sobre una instalación Ruflo desechable, sin modelos ni acceso a red.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepararSesionCodex } from '../scripts/codex-sesion.mjs';

const raiz = fileURLToPath(new URL('..', import.meta.url));

test('Claude y Codex recuperan tarea, pruebas, commit y memoria tras cerrar sus clientes', { timeout: 90_000 }, async (t) => {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nullraptor-ciclo-'));
  const agente = path.join(carpeta, 'agente');
  const trabajo = path.join(carpeta, 'trabajo');
  const casa = path.join(carpeta, 'casa');
  const proyecto = path.join(trabajo, 'proyectos', 'ProyectoPrueba');
  for (const dir of [path.join(agente, 'scripts'), path.join(agente, 'config'), casa, proyecto]) fs.mkdirSync(dir, { recursive: true });
  for (const nombre of ['ruflo-mcp.mjs', 'codex-mcp-puente.mjs', 'codex-mcp.mjs']) {
    fs.copyFileSync(path.join(raiz, 'scripts', nombre), path.join(agente, 'scripts', nombre));
  }
  fs.symlinkSync(path.join(raiz, 'node_modules'), path.join(agente, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(agente, 'config', 'claude-global.md'), 'Prueba aislada de continuidad.');
  // Bloqueo explícito: ninguna descarga de embeddings ni llamada API puede salir del proceso de prueba.
  const bloqueo = path.join(carpeta, 'sin-red.cjs');
  fs.writeFileSync(bloqueo, `const negar = () => { throw new Error('Red desactivada en el ciclo de prueba'); };
globalThis.fetch = async () => negar();
for (const nombre of ['node:http', 'node:https']) {
  const modulo = require(nombre); modulo.request = negar; modulo.get = negar;
}
require('node:net').Socket.prototype.connect = negar;
`);
  const env = {
    PATH: process.env.PATH, HOME: casa, LANG: 'C.UTF-8',
    CLAUDE_FLOW_MEMORY_PATH: path.join(carpeta, 'ruflo', 'swarm'), CLAUDE_FLOW_DISABLE_BRIDGE: '1',
    NODE_OPTIONS: `--require=${bloqueo}`, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
  };
  fs.writeFileSync(path.join(agente, 'config', 'mcp.json'), JSON.stringify({ mcpServers: {
    ruflo: { command: process.execPath, args: [], env },
  } }));
  const preparada = prepararSesionCodex({ agente, trabajo, env });
  const configPuente = preparada.ajustes.mcp_servers.ruflo;
  assert.ok(configPuente);
  const clientes = new Set();
  t.after(async () => {
    for (const cliente of clientes) await cliente.close();
    fs.rmSync(carpeta, { recursive: true, force: true });
  });
  async function abrir(codex) {
    const cliente = new Client({ name: codex ? 'codex-prueba' : 'claude-prueba', version: '1' });
    clientes.add(cliente);
    const transporte = new StdioClientTransport({
      command: codex ? configPuente.command : process.execPath,
      args: codex ? configPuente.args : [path.join(agente, 'scripts', 'ruflo-mcp.mjs')],
      cwd: agente, env, stderr: 'pipe',
    });
    // Consumir el diagnóstico: Ruflo puede avisar de embeddings locales desactivados.
    transporte.stderr.on('data', () => {});
    await cliente.connect(transporte);
    return cliente;
  }
  async function cerrar(cliente) {
    await cliente.close();
    clientes.delete(cliente);
  }
  async function llamar(cliente, name, args = {}) {
    const respuesta = await cliente.callTool({ name, arguments: args });
    assert.ok(!respuesta.isError, JSON.stringify(respuesta));
    const contenido = respuesta.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    const valor = JSON.parse(contenido);
    assert.notEqual(valor.success, false, contenido);
    return valor;
  }
  const namespace = 'proyecto-ProyectoPrueba';
  const clave = { namespace, key: 'en-curso' };
  let claude = await abrir(false);
  let codex = await abrir(true);
  const tarea = await llamar(claude, 'task_create', {
    type: 'feature', description: '[ProyectoPrueba] Sumar cantidades y conservar el relevo', tags: ['ProyectoPrueba'],
  });
  assert.ok(tarea.taskId);
  await llamar(claude, 'memory_store', { ...clave, upsert: true, value: {
    objetivo: 'Implementar suma', rama: 'main', taskId: tarea.taskId, hecho: [], falta: ['Código', 'Pruebas', 'Commit'],
  } });
  assert.equal((await llamar(codex, 'memory_retrieve', clave)).value.taskId, tarea.taskId);
  await cerrar(claude);
  await cerrar(codex);

  codex = await abrir(true);
  const recuperada = await llamar(codex, 'memory_retrieve', clave);
  assert.equal(recuperada.value.taskId, tarea.taskId);
  const listado = await llamar(codex, 'task_list');
  assert.ok(listado.tasks.some((item) => item.taskId === tarea.taskId && item.description.startsWith('[ProyectoPrueba]')));
  assert.ok((await llamar(codex, 'task_status', { taskId: tarea.taskId })).tags.includes('ProyectoPrueba'));
  function ejecutar(comando, args) {
    const resultado = spawnSync(comando, args, { cwd: proyecto, env: { ...env, GIT_CONFIG_NOSYSTEM: '1' }, encoding: 'utf8', timeout: 15_000 });
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);
    return resultado.stdout.trim();
  }
  ejecutar('git', ['init', '-b', 'main']);
  ejecutar('git', ['config', 'user.name', 'Prueba Nullraptor']);
  ejecutar('git', ['config', 'user.email', 'prueba@example.invalid']);
  fs.writeFileSync(path.join(proyecto, 'sumar.mjs'), 'export const sumar = (a, b) => a + b;\n');
  fs.writeFileSync(path.join(proyecto, 'sumar.test.mjs'), `import test from 'node:test';
import assert from 'node:assert/strict';
import { sumar } from './sumar.mjs';
test('sumar conserva cantidades negativas y fraccionarias', () => {
  assert.equal(sumar(-3, 2), -1);
  assert.equal(sumar(0.25, 0.5), 0.75);
  assert.equal(sumar(0, 0), 0);
});
`);
  ejecutar(process.execPath, ['--test', 'sumar.test.mjs']);
  ejecutar('git', ['add', 'sumar.mjs', 'sumar.test.mjs']);
  ejecutar('git', ['commit', '-m', 'Implementa suma con pruebas de cantidades']);
  const commit = ejecutar('git', ['rev-parse', 'HEAD']);
  await llamar(codex, 'task_complete', { taskId: tarea.taskId, result: { commit, pruebas: 'node --test: correcto' } });
  // Codex solo escribe en codex-*: el puente reescribe el namespace y fuerza upsert=false.
  const claveCodex = { namespace: `codex-${namespace}`, key: 'en-curso' };
  await llamar(codex, 'memory_store', { ...clave, upsert: true, value: {
    objetivo: 'Implementar suma', rama: 'main', taskId: tarea.taskId, hecho: ['Código', 'Pruebas', 'Commit'], falta: [], commit,
  } });
  await cerrar(codex);
  claude = await abrir(false);
  assert.equal((await llamar(claude, 'memory_retrieve', claveCodex)).value.commit, commit);
  assert.equal((await llamar(claude, 'memory_retrieve', clave)).value.commit, undefined); // lo de Claude no se pisó
  const final = await llamar(claude, 'task_status', { taskId: tarea.taskId });
  assert.equal(final.status, 'completed');
  assert.equal(final.result.commit, commit);
  assert.equal(ejecutar('git', ['status', '--porcelain']), '');
  assert.equal(ejecutar('git', ['rev-parse', 'HEAD']), commit);
  for (const nombre of ['.claude-flow', '.swarm', '.agents', '.mcp.json']) assert.ok(!fs.existsSync(path.join(proyecto, nombre)));
});
