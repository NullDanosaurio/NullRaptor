import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avisosBoveda, instantaneaBoveda } from '../scripts/relevo-boveda.mjs';
import { CARPETA, ejecutar } from '../scripts/relevo.mjs';

const git = (d, ...a) => execFileSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { stdio: 'ignore' });

test('avisosBoveda: solo avisa de lo nuevo fuera de la nota del proyecto y de una rama distinta de agente', () => {
  const antes = { rama: 'agente', cambios: new Set([' M Proyectos/Viejo.md']) };
  const despues = { rama: 'main', cambios: new Set([' M Proyectos/Viejo.md', ' M Proyectos/Demo.md', '?? otra.md']) };
  const a = avisosBoveda(antes, despues, 'Demo');
  assert.equal(a.length, 2);
  assert.match(a[0], /«main»/);
  assert.match(a[1], /otra\.md/);
  assert.ok(!a[1].split(': ')[1].includes('Demo.md') && !a[1].includes('Viejo.md'));
  assert.deepEqual(avisosBoveda(antes, { rama: 'agente', cambios: new Set([' M Proyectos/Demo.md']) }, 'Demo'), []);
  assert.deepEqual(avisosBoveda(null, despues, 'Demo'), []);
});

test('ejecutar deja en el resumen y en el estado el aviso por archivos de la bóveda tocados fuera de la nota', async (t) => {
  const t0 = fs.mkdtempSync(path.join(os.tmpdir(), 'relevo-boveda-'));
  t.after(() => fs.rmSync(t0, { recursive: true, force: true }));
  const boveda = path.join(t0, 'boveda');
  fs.mkdirSync(path.join(boveda, 'Proyectos'), { recursive: true });
  fs.writeFileSync(path.join(boveda, 'Proyectos', 'Demo.md'), 'a');
  git(boveda, 'init', '-q', '-b', 'main');
  git(boveda, 'add', '.');
  git(boveda, 'commit', '-q', '-m', 'x');
  const trabajo = path.join(t0, 'trabajo');
  fs.mkdirSync(path.join(trabajo, CARPETA), { recursive: true });
  fs.mkdirSync(path.join(trabajo, 'proyectos', 'Demo'), { recursive: true });
  fs.writeFileSync(path.join(trabajo, CARPETA, 'Demo.senal.json'), JSON.stringify({ proyecto: 'Demo', cwd: path.join(trabajo, 'proyectos', 'Demo'), error: 'rate_limit' }));
  fs.cpSync(path.join(fileURLToPath(new URL('..', import.meta.url)), 'config'), path.join(trabajo, 'config'), { recursive: true });
  const falso = path.join(t0, 'codex-falso.sh');
  fs.writeFileSync(falso, `#!/bin/sh\ncat > /dev/null\necho n > "${boveda}/Proyectos/Demo.md"\necho x > "${boveda}/intrusa.md"\n`, { mode: 0o755 });
  const env = { ...process.env, HOME: path.join(t0, 'casa'), BOVEDA_DIR: boveda, RUFLO_CODEX_EXE: falso, RUFLO_TAREAS: path.join(t0, 'sin.json'), CLAUDE_FLOW_MEMORY_PATH: path.join(t0, 'x') };
  await ejecutar('Demo', { trabajo, env, agente: trabajo });
  const resumen = fs.readFileSync(path.join(trabajo, CARPETA, 'Demo.codex.md'), 'utf8');
  assert.match(resumen, /Avisos de seguridad/);
  assert.match(resumen, /intrusa\.md/);
  assert.match(resumen, /«main»/);
  assert.ok(!/fuera de [^:]+: [^\n]*Proyectos\/Demo\.md/.test(resumen));
  const estado = JSON.parse(fs.readFileSync(path.join(trabajo, CARPETA, 'Demo.estado.json'), 'utf8'));
  assert.equal(estado.avisos.length, 2);
  assert.equal(instantaneaBoveda(path.join(t0, 'no-existe')), null);
});
