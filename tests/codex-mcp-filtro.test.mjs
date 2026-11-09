import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AUTOAPROBADAS } from '../scripts/codex-mcp.mjs';

const puente = path.join(fileURLToPath(new URL('..', import.meta.url)), 'scripts', 'codex-mcp-puente.mjs');

// Servidor MCP falso: apunta en un archivo todo lo que recibe y responde a tools/list y tools/call.
const FALSO = `const fs=require('fs');const log=process.argv[2];let b='';process.stdin.on('data',d=>{b+=d;const l=b.split('\\n');b=l.pop();for(const x of l){if(!x.trim())continue;fs.appendFileSync(log,x+'\\n');const m=JSON.parse(x);
if(m.method==='tools/list')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:${JSON.stringify([...AUTOAPROBADAS.ruflo, 'terminal_execute', 'http_fetch', 'browser_open']).replace(/"/g, "'")}.map(name=>({name,inputSchema:{type:'object',properties:Object.fromEntries(['key','value','namespace','tags','upsert','dbPath','query','description','taskId','type','status'].map(k=>[k,{}]))}}))}}));
else if(m.method==='tools/call')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'ejecutado '+m.params.name}]}}));
else if(m.id!==undefined)console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{}}));}});`;

async function sesion(t, nombre, mensajes, { inicializar = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puente-filtro-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const registro = path.join(dir, 'recibido.log');
  fs.writeFileSync(path.join(dir, 'falso.cjs'), FALSO);
  const mcp = path.join(dir, 'mcp.json');
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { [nombre]: { command: process.execPath, args: [path.join(dir, 'falso.cjs'), registro] } } }));
  const hijo = spawn(process.execPath, [puente, mcp, nombre], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  hijo.stdout.on('data', (d) => { out += d; });
  hijo.stderr.on('data', (d) => { err += d; });
  if (inicializar) mensajes = [{ jsonrpc: '2.0', method: 'notifications/initialized' }, ...mensajes];
  hijo.stdin.write(mensajes.map((m) => `${JSON.stringify(m)}\n`).join(''));
  await new Promise((r) => setTimeout(r, 800));
  hijo.stdin.end();
  await new Promise((r) => hijo.on('close', r));
  const respuestas = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const recibido = fs.existsSync(registro) ? fs.readFileSync(registro, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { respuestas, recibido, err };
}

const llamada = (id, name) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: {} } });
const lista = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

test('puente de ruflo: tools/list solo trae las permitidas; las peligrosas se rechazan sin llegar al servidor; una permitida funciona', async (t) => {
  const { respuestas, recibido, err } = await sesion(t, 'ruflo', [lista, llamada(2, 'terminal_execute'), llamada(3, 'http_fetch'), llamada(4, 'browser_open'), llamada(5, 'mcp__ruflo__terminal_execute'), llamada(6, 'task_list'), { jsonrpc: '2.0', id: 7, method: 'ping' }]);
  const porId = (id) => respuestas.find((r) => r.id === id);
  assert.deepEqual(porId(1).result.tools.map((x) => x.name), AUTOAPROBADAS.ruflo);
  for (const id of [2, 3, 4, 5]) assert.match(porId(id).error.message, /no permitida/, `id ${id}`);
  assert.match(porId(6).result.content[0].text, /ejecutado task_list/);
  assert.deepEqual(porId(7).result, {}); // el resto de métodos se reenvía igual
  assert.deepEqual(recibido.filter((m) => m.method === 'tools/call').map((m) => m.params.name), ['task_list']);
  assert.match(err, /rechazada/);
});

test('un servidor sin lista (herramienta propia) sigue como antes: todo pasa', async (t) => {
  const { respuestas, recibido } = await sesion(t, 'herramienta-x', [lista, llamada(2, 'terminal_execute')]);
  assert.equal(respuestas.find((r) => r.id === 1).result.tools.length, AUTOAPROBADAS.ruflo.length + 3);
  assert.match(respuestas.find((r) => r.id === 2).result.content[0].text, /terminal_execute/);
  assert.equal(recibido.filter((m) => m.method === 'tools/call').length, 1);
});

test('un servidor llamado como una propiedad heredada (constructor, toString) no recibe approve ni filtro propio', async (t) => {
  const { ajustesMcpCodex } = await import('../scripts/codex-mcp.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puente-heredado-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const mcp = path.join(dir, 'mcp.json');
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { constructor: { command: 'x' }, toString: { command: 'x' }, __proto__x: { command: 'x' } } }));
  const { mcp_servers: s } = ajustesMcpCodex({ agente: '/a', mcp });
  for (const n of ['constructor', 'toString']) {
    assert.equal(s[n].default_tools_approval_mode, undefined, n);
    assert.equal(s[n].enabled_tools, undefined, n);
  }
  // El puente de «constructor» no filtra (comportamiento de servidor sin lista): una herramienta cualquiera llega al servidor.
  const { respuestas } = await sesion(t, 'constructor', [lista, llamada(2, 'terminal_execute')]);
  assert.equal(respuestas.find((r) => r.id === 1).result.tools.length, AUTOAPROBADAS.ruflo.length + 3);
});

test('los argumentos se validan contra el esquema real: dbPath y claves desconocidas se rechazan sin llegar al servidor', async (t) => {
  const con = (id, name, arguments_) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: arguments_ } });
  const { respuestas, recibido } = await sesion(t, 'ruflo', [
    con(2, 'memory_retrieve', { key: 'k', dbPath: '/etc/passwd' }),
    con(3, 'memory_search', { query: 'x', dbpath: '/etc/passwd' }),
    con(4, 'task_list', { oculto: 1 }),
    con(5, 'memory_list', 'no-objeto'),
    con(6, 'memory_retrieve', { key: 'k', namespace: 'n' }),
  ]);
  const porId = (id) => respuestas.find((r) => r.id === id);
  assert.match(porId(2).error.message, /dbPath/);
  assert.match(porId(3).error.message, /no permitido/);
  assert.match(porId(4).error.message, /oculto/);
  assert.match(porId(5).error.message, /no válidos/);
  assert.match(porId(6).result.content[0].text, /ejecutado memory_retrieve/);
  const llamadas = recibido.filter((m) => m.method === 'tools/call');
  assert.deepEqual(llamadas.map((m) => m.params.name), ['memory_retrieve']);
  assert.equal(llamadas[0].params.arguments.dbPath, undefined);
  assert.ok(!respuestas.some((r) => r.id === 'nullraptor-esquemas')); // la consulta propia de esquemas no sale hacia Codex
});

test('sin esquema conocido (el servidor nunca lo da) la llamada cae cerrada', async (t) => {
  const { crearFiltro } = await import('../scripts/codex-mcp-puente.mjs');
  const f = crearFiltro(['task_list'], 'ruflo', () => {});
  assert.match(f.validar('task_list', {}), /Esquema/);
  f.aprender([{ name: 'task_list', inputSchema: { type: 'object', properties: {} } }]);
  assert.equal(f.validar('task_list', {}), null);
  assert.match(f.validar('task_list', { x: 1 }), /no permitido/);
});
