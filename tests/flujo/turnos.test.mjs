// Turno de Codex (sin revisión, nunca toca main) y traída del trabajo desde su rama para el turno de revisión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (a, cwd) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const escribir = (raiz, archivo, texto) => { fs.mkdirSync(path.dirname(path.join(raiz, archivo)), { recursive: true }); fs.writeFileSync(path.join(raiz, archivo), texto); };

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flujo-'));
  git(['init', '-q', '-b', 'main'], dir);
  git(['config', 'user.name', 'prueba'], dir);
  git(['config', 'user.email', 'prueba@local'], dir);
  return dir;
}

test('turno de Codex: «listo para revisar» en su rama, main intacto, no se repite y nada del flujo en el proyecto', () => {
  const p = repo();
  const nombre = path.basename(p);
  const boveda = fs.mkdtempSync(path.join(os.tmpdir(), 'boveda-'));
  const trabajo = fs.mkdtempSync(path.join(os.tmpdir(), 'trabajo-'));
  escribir(p, '.gitignore', 'node_modules/\n');
  // El contrato de la tarea vive en la bóveda, no en el proyecto.
  escribir(boveda, `Proyectos/${nombre}/Tareas/T1.md`, '# Saludo\n\nId: T1\nDepende de: ninguna\nArchivos permitidos: src/saludo.ts\nPruebas de aceptación: ninguna\n');
  // Proyecto falso: typecheck y build siempre pasan.
  for (const bin of ['typescript/bin/tsc', 'next/dist/bin/next', '@playwright/test/cli.js']) escribir(p, `node_modules/${bin}`, 'process.exit(0);\n');
  git(['add', '.'], p);
  git(['commit', '-qm', 'base'], p);
  const base = git(['rev-parse', 'HEAD'], p);
  const turno = () => spawnSync(process.execPath, [path.join(AGENTE, 'flujo/flujo.mjs'), 'plan', '--turno-codex', '--simulador=correcto', '--sin-e2e', '--intentos=1'],
    { cwd: AGENTE, env: { ...process.env, FLUJO_PROYECTO: p, BOVEDA_DIR: boveda, TRABAJO_DIR: trabajo }, encoding: 'utf8' });

  const r = turno();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const estado = JSON.parse(fs.readFileSync(path.join(trabajo, 'flujo', nombre, 'runs', 'estado-tareas.json'), 'utf8')).T1;
  for (const resto of ['.runs', '.worktrees', 'tareas']) assert.ok(!fs.existsSync(path.join(p, resto)), resto);
  assert.equal(git(['status', '--porcelain'], p), '', 'el proyecto queda limpio');
  assert.equal(estado.estado, 'listo para revisar');
  assert.equal(git(['rev-parse', 'main'], p), base, 'main no debe cambiar sin revisión');
  assert.ok(!fs.existsSync(path.join(p, 'src/saludo.ts')));
  assert.match(git(['show', `flujo/${estado.ejecucion}:src/saludo.ts`], p), /Hola/);

  assert.match(turno().stdout, /No hay tareas pendientes/, 'lo listo espera a «revisar»');
  for (const d of [p, boveda, trabajo]) fs.rmSync(d, { recursive: true, force: true });
});

test('turno de revisión: trae de la rama altas, cambios, borrados y renombrados', async () => {
  const p = repo();
  for (const f of ['b.txt', 'c.txt', 'd.txt']) escribir(p, f, `${f}\n`);
  git(['add', '.'], p);
  git(['commit', '-qm', 'base'], p);
  git(['checkout', '-q', '-b', 'codex'], p);
  escribir(p, 'a.txt', 'nuevo\n');
  escribir(p, 'b.txt', 'cambiado\n');
  git(['rm', '-q', 'c.txt'], p);
  git(['mv', 'd.txt', 'e.txt'], p);
  git(['add', '.'], p);
  git(['commit', '-qm', 'trabajo de codex'], p);
  git(['checkout', '-q', 'main'], p);

  process.env.FLUJO_PROYECTO = p;
  const { implementar } = await import('../../flujo/lib/agentes.mjs');
  const tarea = { id: 'T', ruta: 'T.md', texto: '', permitidos: [], pruebas: [] };
  await implementar({ wt: p, dir: fs.mkdtempSync(path.join(os.tmpdir(), 'runs-')), n: 1, tarea, desdeRama: 'codex' });

  const leer = (f) => fs.readFileSync(path.join(p, f), 'utf8').replace(/\r\n/g, '\n'); // core.autocrlf en Windows
  assert.equal(leer('a.txt'), 'nuevo\n');
  assert.equal(leer('b.txt'), 'cambiado\n');
  assert.ok(!fs.existsSync(path.join(p, 'c.txt')), 'borrado');
  assert.ok(!fs.existsSync(path.join(p, 'd.txt')) && fs.existsSync(path.join(p, 'e.txt')), 'renombrado');
  fs.rmSync(p, { recursive: true, force: true });
});
