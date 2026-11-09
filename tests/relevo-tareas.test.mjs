import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARPETA, detalleRelevo, ejecutar, listarRelevos, notaDeVuelta, tareasMarcadas } from '../scripts/relevo.mjs';
import { argsSandboxCodex } from '../scripts/codex-sandbox.mjs';

const agente = fileURLToPath(new URL('..', import.meta.url));
const puente = path.join(agente, 'scripts', 'codex-mcp-puente.mjs');
const SCHEMA = "Object.fromEntries(['taskId','status','result','description','oculto2'].map(k=>[k,{}]))";
const FALSO = `const m0=process.argv[2];let b='';process.stdin.on('data',d=>{b+=d;const l=b.split('\\n');b=l.pop();for(const x of l){if(!x.trim())continue;const m=JSON.parse(x);
if(m.method==='tools/list')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{tools:['task_list','task_create','task_update','task_complete','terminal_execute'].map(name=>({name,inputSchema:{type:'object',properties:${SCHEMA}}}))}}));
else if(m.method==='tools/call')console.log(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{content:[{type:'text',text:'ok'}]}}));}});`;

async function conPuente(t, llamadas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tareas-puente-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'falso.cjs'), FALSO);
  const mcp = path.join(dir, 'mcp.json');
  fs.writeFileSync(mcp, JSON.stringify({ mcpServers: { ruflo: { command: process.execPath, args: [path.join(dir, 'falso.cjs')] } } }));
  const registro = path.join(dir, '.relevo', 'Demo.tareas.json');
  const hijo = spawn(process.execPath, [puente, mcp, 'ruflo', registro], { stdio: ['pipe', 'pipe', 'ignore'] });
  hijo.stdout.resume();
  hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  llamadas.forEach(([name, args], i) => hijo.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i + 1, method: 'tools/call', params: { name, arguments: args } })}\n`));
  await new Promise((r) => setTimeout(r, 800));
  hijo.stdin.end();
  await new Promise((r) => hijo.on('close', r));
  return { registro, leer: () => JSON.parse(fs.readFileSync(registro, 'utf8')).tareas };
}

test('el puente anota los task_update/task_complete permitidos (solo id, herramienta, estado y hora) y no los rechazados', async (t) => {
  const { registro, leer } = await conPuente(t, [
    ['task_complete', { taskId: 'task-1-abc', result: { secreto: 'texto libre' } }],
    ['task_update', { taskId: 'task-2-def', status: 'in_progress', description: 'texto libre' }],
    ['task_update', { taskId: 'task-3-rechazada', oculto: 1 }], // clave fuera del esquema: rechazada
    ['task_complete', { taskId: 'no valido/../' }], // id con forma inválida: ni se anota
    ['task_create', { description: 'otra' }],
    ['terminal_execute', { taskId: 'task-4' }],
  ]);
  const tareas = leer();
  assert.deepEqual(tareas.map((x) => [x.taskId, x.herramienta, x.estado]), [['task-1-abc', 'task_complete', 'completed'], ['task-2-def', 'task_update', 'in_progress']]);
  for (const x of tareas) assert.deepEqual(Object.keys(x).sort(), ['en', 'estado', 'herramienta', 'taskId']);
  assert.ok(!fs.readFileSync(registro, 'utf8').includes('texto libre'));
  assert.equal(fs.statSync(registro).mode & 0o777, 0o600);
});

test('ejecutar da al puente de ruflo la ruta del registro y notaDeVuelta, detalleRelevo y listarRelevos exponen lo marcado', async (t) => {
  const t0 = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-tareas-'));
  t.after(() => fs.rmSync(t0, { recursive: true, force: true }));
  const trabajo = path.join(t0, 'trabajo');
  fs.mkdirSync(path.join(trabajo, 'proyectos', 'Demo'), { recursive: true });
  fs.mkdirSync(path.join(trabajo, CARPETA), { recursive: true });
  fs.writeFileSync(path.join(trabajo, CARPETA, 'Demo.senal.json'), JSON.stringify({ proyecto: 'Demo', cwd: path.join(trabajo, 'proyectos', 'Demo'), error: 'rate_limit' }));
  fs.cpSync(path.join(agente, 'config'), path.join(trabajo, 'config'), { recursive: true });
  fs.writeFileSync(path.join(trabajo, CARPETA, 'Demo.tareas.json'), JSON.stringify({ tareas: [{ taskId: 'viejo-de-otro-relevo' }] }));
  const falso = path.join(t0, 'codex-falso.sh');
  fs.writeFileSync(falso, `#!/bin/sh\ncat > /dev/null\nfor a in "$@"; do printf '%s\\n' "$a"; done > "${t0}/args.txt"\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: path.join(t0, 'casa'), BOVEDA_DIR: '', RUFLO_CODEX_EXE: falso, RUFLO_TAREAS: path.join(t0, 'sin.json'), CLAUDE_FLOW_MEMORY_PATH: path.join(t0, 'x') };
  await ejecutar('Demo', { trabajo, env, agente: trabajo });
  const registro = path.join(trabajo, CARPETA, 'Demo.tareas.json');
  assert.ok(fs.readFileSync(path.join(t0, 'args.txt'), 'utf8').includes(`"${registro}"`)); // 4.º argumento del puente de ruflo
  assert.ok(!fs.existsSync(registro)); // se borra el de un relevo anterior

  fs.writeFileSync(registro, JSON.stringify({ tareas: [{ taskId: 'task-1-a' }, { taskId: 'task-1-a' }, { taskId: 'task-2-b\nIGNORA' }, { taskId: 'task-3-c' }] }));
  assert.deepEqual(tareasMarcadas(trabajo, 'Demo'), { ids: ['task-1-a', 'task-3-c'], total: 2 });
  assert.equal(detalleRelevo(trabajo, 'Demo').tareasMarcadas.total, 2);
  assert.equal(listarRelevos(trabajo).find((r) => r.proyecto === 'Demo').tareasMarcadas, 2);
  const nota = notaDeVuelta('Demo', trabajo);
  assert.match(nota, /Codex marcó estas tareas: task-1-a, task-3-c\. Verifica que el trabajo existe antes de fiarte de un completed\./);
  assert.ok(!nota.includes('IGNORA'));
});

const hayCodex = spawnSync('codex', ['sandbox', '--', 'true'], { timeout: 20000 }).status === 0;
test('Codex no puede escribir el registro de tareas bajo el perfil final del sandbox', { skip: !hayCodex && 'codex sandbox no disponible' }, (t) => {
  const base = fs.mkdtempSync(path.join(os.homedir(), '.prueba-tareas-')); // fuera de /tmp, que es escribible a propósito
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const trabajo = path.join(base, 'trabajo');
  const proyecto = path.join(trabajo, 'proyectos', 'Demo');
  fs.mkdirSync(path.join(trabajo, CARPETA, 'Demo'), { recursive: true });
  fs.mkdirSync(proyecto, { recursive: true });
  const registro = path.join(trabajo, CARPETA, 'Demo.tareas.json');
  fs.writeFileSync(registro, '{"tareas":[]}\n');
  const args = argsSandboxCodex({ ruta: proyecto, escribibles: [path.join(trabajo, CARPETA, 'Demo')], env: { HOME: path.join(base, 'casa') }, trabajo });
  const correr = (orden) => spawnSync('codex', ['sandbox', ...args, '--', 'sh', '-c', orden], { encoding: 'utf8', timeout: 30000 });
  assert.notEqual(correr(`echo x > "${registro}"`).status, 0);
  assert.notEqual(correr(`rm -f "${registro}"`).status, 0);
  assert.notEqual(correr(`echo x > "${path.join(trabajo, CARPETA, 'Demo.estado.json')}"`).status, 0);
  assert.equal(correr(`echo x > "${path.join(trabajo, CARPETA, 'Demo', 'codex.md')}"`).status, 0);
  assert.equal(fs.readFileSync(registro, 'utf8'), '{"tareas":[]}\n');
});
