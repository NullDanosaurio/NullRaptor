import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { anotarSenal, argsCodex, armarBriefing, detalleRelevo, ejecutar, esLimite, estadoRelevo, lanzar, leerEnCurso, listarRelevos, notaDeVuelta, proyectoDe } from '../scripts/relevo.mjs';

const trabajo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-'));

test('esLimite: solo el límite de uso y el saldo cuentan como «sin tokens»', () => {
  assert.equal(esLimite({ error: 'rate_limit' }), true);
  assert.equal(esLimite({ error: 'billing_error' }), true);
  for (const e of ['server_error', 'unknown', 'max_output_tokens', undefined]) assert.equal(esLimite({ error: e }), false);
  assert.equal(esLimite(null), false);
});

test('proyectoDe: solo dentro de $TRABAJO_DIR/proyectos/<Proyecto>', () => {
  const t = trabajo();
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo'), t), 'Demo');
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo', 'src', 'x'), t), 'Demo');
  for (const fuera of [path.join(t, 'proyectos'), path.join(t, 'otra'), path.join(t, 'proyectos', '..', 'x'), '/tmp']) assert.equal(proyectoDe(fuera, t), null);
  assert.equal(proyectoDe(undefined, t), null);
  assert.equal(proyectoDe(path.join(t, 'proyectos', 'Demo'), undefined), null);
});

test('anotarSenal escribe la señal del proyecto y no hace nada si no procede', () => {
  const t = trabajo();
  const cwd = path.join(t, 'proyectos', 'Demo');
  const r = anotarSenal({ error: 'rate_limit', cwd, session_id: 's1' }, t, new Date('2026-11-04T10:00:00Z'));
  assert.equal(r.proyecto, 'Demo');
  assert.deepEqual(JSON.parse(fs.readFileSync(r.ruta, 'utf8')), { proyecto: 'Demo', cwd, error: 'rate_limit', sesion: 's1', en: '2026-11-04T10:00:00.000Z' });
  assert.equal(r.ruta, path.join(t, '.relevo', 'Demo.senal.json'));
  assert.equal(anotarSenal({ error: 'server_error', cwd }, t), null);
  assert.equal(anotarSenal({ error: 'rate_limit', cwd: '/tmp' }, t), null);
});

test('leerEnCurso saca el valor de la tabla de Ruflo y devuelve null si falla', () => {
  const tabla = '[INFO] x\n+---- Memory Entry ----+\n| Key: en-curso   |\n| Value:   |\n| {"tarea":"X"}    |\n+------+\n';
  assert.equal(leerEnCurso('Demo', { correr: () => tabla }), '{"tarea":"X"}');
  assert.equal(leerEnCurso('Demo', { correr: () => 'Entry not found' }), null);
  assert.equal(leerEnCurso('Demo', { correr: () => { throw new Error('timeout'); } }), null);
});

test('armarBriefing: tareas abiertas del proyecto, estado de Ruflo, git y reglas del relevo', () => {
  const tareas = [
    { id: 't1', proyecto: 'Demo', texto: 'Hacer A', estado: 'en curso' },
    { id: 't2', proyecto: 'Demo', texto: 'Hacer B', estado: 'pendiente' },
    { id: 't3', proyecto: 'Demo', texto: 'Ya hecha', estado: 'hecha' },
    { id: 't4', proyecto: 'Otro', texto: 'De otro', estado: 'pendiente' },
  ];
  const b = armarBriefing({ proyecto: 'Demo', cwd: '/w/proyectos/Demo', senal: { en: '2026-11-04T10:00:00Z' }, tareas, enCurso: '{"tarea":"X"}', rama: 'feat', estadoGit: ' M a.js', commits: 'abc1234 algo' });
  assert.match(b, /relevas a Claude en el desarrollo de «Demo»/);
  assert.match(b, /\[en curso\] t1: Hacer A\n- \[pendiente\] t2: Hacer B/);
  assert.doesNotMatch(b, /Ya hecha|De otro/);
  assert.match(b, /proyecto-Demo \/ en-curso\)\n\{"tarea":"X"\}/);
  assert.match(b, /rama feat\)\n M a\.js/);
  assert.match(b, /sin Co-Authored-By/);
  assert.match(b, /\.relevo\/Demo\.codex\.md/);
  const vacio = armarBriefing({ proyecto: 'Demo', cwd: '/w', tareas: [], enCurso: null, rama: '', estadoGit: '', commits: '' });
  assert.match(vacio, /\(ninguna registrada en Ruflo\)/);
  assert.match(vacio, /\(no disponible\)/);
});

const senalDe = (t, proyecto = 'Demo') => {
  const cwd = path.join(t, 'proyectos', proyecto);
  fs.mkdirSync(cwd, { recursive: true });
  return anotarSenal({ error: 'rate_limit', cwd }, t) && JSON.parse(fs.readFileSync(path.join(t, '.relevo', `${proyecto}.senal.json`), 'utf8'));
};

test('argsCodex: si el proyecto tiene .git, Codex puede escribir en él (para hacer commits)', () => {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-git-'));
  fs.mkdirSync(path.join(p, '.git'));
  assert.deepEqual(argsCodex({ cwd: p, dirRelevo: '/d', salida: '/s' }).filter((_, i, a) => a[i - 1] === '--add-dir'), ['/d', path.join(p, '.git')]);
  assert.equal(argsCodex({ cwd: '/no/existe', dirRelevo: '/d', salida: '/s' }).filter((x) => x === '--add-dir').length, 1);
});

test('argsCodex: sandbox workspace-write con la carpeta .relevo; sin sandbox solo si se pide', () => {
  const a = argsCodex({ cwd: '/p', dirRelevo: '/t/.relevo', salida: '/t/.relevo/D.final.md' });
  assert.deepEqual(a.slice(0, 8), ['--no-daemon', 'exec', '--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=false', '--add-dir', '/t/.relevo']);
  assert.equal(a.at(-1), '-');
  assert.ok(a.includes('--json'));
  assert.ok(!a.includes('--ephemeral'));
  assert.ok(!a.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(argsCodex({ cwd: '/p', dirRelevo: '/d', salida: '/s', sinSandbox: true }).includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('lanzar: arranca el relevo aparte una sola vez mientras siga en curso', () => {
  const t = trabajo();
  const senal = senalDe(t);
  const llamadas = [];
  const arrancar = (cmd, args, op) => { llamadas.push({ args, op }); return { pid: process.pid, unref() {} }; };
  assert.deepEqual(lanzar(senal, { trabajo: t, arrancar }), { lanzado: true, pid: process.pid });
  assert.deepEqual(llamadas[0].args.slice(1), ['ejecutar', 'Demo']);
  assert.equal(llamadas[0].op.detached, true);
  assert.equal(estadoRelevo(t, 'Demo').estado, 'en curso');
  assert.deepEqual(lanzar(senal, { trabajo: t, arrancar }), { lanzado: false, motivo: 'ya hay un relevo en curso' });
  assert.equal(llamadas.length, 1);
  // Un relevo cuyo proceso murió (reinicio) cuenta como interrumpido y se puede relanzar.
  fs.writeFileSync(path.join(t, '.relevo', 'Demo.estado.json'), JSON.stringify({ estado: 'en curso', pid: 2 ** 22 + 12345 }));
  assert.equal(estadoRelevo(t, 'Demo').estado, 'error');
  assert.equal(lanzar(senal, { trabajo: t, arrancar }).lanzado, true);
});

test('ejecutar corre Codex con el briefing por la entrada y deja el estado final', async () => {
  const t = trabajo();
  senalDe(t);
  const falso = path.join(t, 'codex-falso.sh');
  fs.writeFileSync(falso, `#!/bin/sh\necho "$@" > "${t}/args.txt"\ncat > "${t}/entrada.txt"\nprintf '%s\\n' '{"type":"thread.started","thread_id":"11111111-1111-4111-8111-111111111111"}'\nexit \${CODIGO:-0}\n`, { mode: 0o755 });
  const env = { ...process.env, RUFLO_CODEX_EXE: falso, RUFLO_TAREAS: path.join(t, 'sin-tareas.json'), CLAUDE_FLOW_MEMORY_PATH: path.join(t, 'x') };
  assert.equal(await ejecutar('Demo', { trabajo: t, env, agente: t }), 0);
  assert.match(fs.readFileSync(path.join(t, 'entrada.txt'), 'utf8'), /relevas a Claude en el desarrollo de «Demo»/);
  assert.match(fs.readFileSync(path.join(t, 'entrada.txt'), 'utf8'), new RegExp(`${path.join(t, '.relevo', 'Demo.codex.md').replace(/\./g, '\\.')} un resumen`));
  assert.match(fs.readFileSync(path.join(t, 'args.txt'), 'utf8'), /^--no-daemon exec --sandbox workspace-write /);
  const fin = estadoRelevo(t, 'Demo');
  assert.equal(fin.estado, 'terminado');
  assert.equal(fin.codigo, 0);
  assert.equal(fin.sesionCodex, '11111111-1111-4111-8111-111111111111');
  // Código de salida distinto de 0 → error; con RELEVO_SIN_SANDBOX=1 → sin sandbox.
  assert.equal(await ejecutar('Demo', { trabajo: t, env: { ...env, CODIGO: '3', RELEVO_SIN_SANDBOX: '1' }, agente: t }), 3);
  assert.equal(estadoRelevo(t, 'Demo').estado, 'error');
  assert.match(fs.readFileSync(path.join(t, 'args.txt'), 'utf8'), /--dangerously-bypass-approvals-and-sandbox/);
  await assert.rejects(ejecutar('Otro', { trabajo: t, env, agente: t }), /No hay señal/);
});

test('listarRelevos y detalleRelevo: para el panel, con registro y resumen, sin salirse de .relevo', () => {
  const t = trabajo();
  assert.deepEqual(listarRelevos(t), []);
  const dir = path.join(t, '.relevo');
  fs.mkdirSync(dir, { recursive: true });
  const ahora = Date.parse('2026-11-04T12:00:00Z');
  const guardar = (p, e) => fs.writeFileSync(path.join(dir, `${p}.estado.json`), JSON.stringify(e));
  guardar('Viejo', { estado: 'terminado', inicio: '2026-11-01T10:00:00Z', fin: '2026-11-01T11:00:00Z', codigo: 0 });
  guardar('Hecho', { estado: 'terminado', inicio: '2026-11-04T08:00:00Z', fin: '2026-11-04T09:00:00Z', codigo: 0 });
  guardar('Vivo', { estado: 'en curso', pid: process.pid, inicio: '2026-11-04T11:00:00Z' });
  fs.writeFileSync(path.join(dir, 'Hecho.codex.md'), 'Hice A');
  fs.writeFileSync(path.join(dir, 'Hecho.log'), Array.from({ length: 100 }, (_, i) => `l${i}`).join('\n'));
  assert.deepEqual(listarRelevos(t, ahora).map((r) => [r.proyecto, r.estado, r.resumen]), [['Vivo', 'en curso', false], ['Hecho', 'terminado', true]]);
  const d = detalleRelevo(t, 'Hecho', 5);
  assert.equal(d.resumen, 'Hice A');
  assert.equal(d.registro, 'l95\nl96\nl97\nl98\nl99');
  for (const malo of ['../x', '..', 'a/b', '', 'No-existe']) assert.equal(detalleRelevo(t, malo), null);
});

test('notaDeVuelta: avisa a Claude una sola vez de lo que hizo Codex, o de que sigue trabajando', () => {
  const t = trabajo();
  assert.equal(notaDeVuelta('Demo', t), null);
  const dir = path.join(t, '.relevo');
  fs.mkdirSync(dir, { recursive: true });
  const estado = path.join(dir, 'Demo.estado.json');
  fs.writeFileSync(estado, JSON.stringify({ estado: 'en curso', pid: process.pid, inicio: '2026-11-04T10:00:00Z' }));
  assert.match(notaDeVuelta('Demo', t), /Codex está trabajando ahora en «Demo»/);
  assert.match(notaDeVuelta('Demo', t), /Codex está trabajando/); // en curso: se repite, no se marca
  fs.writeFileSync(estado, JSON.stringify({ estado: 'terminado', inicio: '2026-11-04T10:00:00Z', fin: '2026-11-04T11:00:00Z', codigo: 0 }));
  const nota = notaDeVuelta('Demo', t, new Date('2026-11-04T12:00:00Z'));
  assert.match(nota, /Codex siguió el desarrollo \(terminado/);
  assert.match(nota, /Demo\.codex\.md/);
  assert.match(nota, /ejecuta las pruebas/);
  assert.equal(JSON.parse(fs.readFileSync(estado, 'utf8')).revisado, '2026-11-04T12:00:00.000Z');
  assert.equal(notaDeVuelta('Demo', t), null);
});
