// Arranque del agente: clona o actualiza su memoria (Obsidian) y los proyectos, y después ejecuta la orden pedida.
// Uso: node scripts/preparar.mjs [orden...]   (sin orden: scripts/verificar.mjs)
// Variables: MEMORIA_REPO (obligatoria), PROYECTOS (URLs separadas por comas), TRABAJO_DIR,
//            GITHUB_TOKEN (opcional; solo en memoria del proceso), AGENTE_GIT_NOMBRE, AGENTE_GIT_EMAIL.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RAMA_MEMORIA = 'agente'; // el agente nunca escribe en main: Daniel fusiona.
const trabajo = path.resolve(process.env.TRABAJO_DIR ?? '/trabajo');
const memoriaRepo = process.env.MEMORIA_REPO;
if (!memoriaRepo) { console.error('Falta MEMORIA_REPO (URL del repositorio de la memoria).'); process.exit(1); }

// El token va por variables de entorno de git: no queda en disco, en .git/config ni en los argumentos.
const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
if (process.env.GITHUB_TOKEN) {
  const basic = Buffer.from(`x-access-token:${process.env.GITHUB_TOKEN}`).toString('base64');
  Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` });
}
const git = (args, cwd) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const nombreDe = (url) => path.basename(url.replace(/\/+$/, '')).replace(/\.git$/, '');

const existe = (ref, cwd) => { try { git(['rev-parse', '--verify', '--quiet', ref], cwd); return true; } catch { return false; } };

// Solo avance rápido: si hay trabajo local que diverge, no se toca y se avisa.
function avanzar(destino, refs) {
  for (const ref of refs.filter((r) => existe(r, destino))) {
    try { git(['merge', '--ff-only', ref], destino); } catch { console.warn(`Aviso: ${destino} no avanza en rápido hacia ${ref}; se deja como está.`); }
  }
}

function clonarOActualizar(url, destino) {
  if (fs.existsSync(path.join(destino, '.git'))) {
    git(['fetch', '--prune', 'origin'], destino);
    avanzar(destino, ['@{u}']);
  } else {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    git(['clone', '-c', 'core.longpaths=true', url, destino]); // longpaths: nombres largos en Windows
  }
}

// Memoria: rama propia del agente; recibe lo que Daniel fusiona en la principal.
const memoria = path.join(trabajo, 'memoria');
clonarOActualizar(memoriaRepo, memoria);
const principal = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], memoria); // p. ej. origin/main
if (git(['rev-parse', '--abbrev-ref', 'HEAD'], memoria) !== RAMA_MEMORIA) {
  git(existe(`origin/${RAMA_MEMORIA}`, memoria) ? ['checkout', '-B', RAMA_MEMORIA, `origin/${RAMA_MEMORIA}`] : ['checkout', '-b', RAMA_MEMORIA], memoria);
}
avanzar(memoria, [`origin/${RAMA_MEMORIA}`, principal]);
if (process.env.AGENTE_GIT_NOMBRE) git(['config', 'user.name', process.env.AGENTE_GIT_NOMBRE], memoria);
if (process.env.AGENTE_GIT_EMAIL) git(['config', 'user.email', process.env.AGENTE_GIT_EMAIL], memoria);

const proyectos = (process.env.PROYECTOS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
for (const url of proyectos) clonarOActualizar(url, path.join(trabajo, 'proyectos', nombreDe(url)));

console.error(`Memoria lista en ${memoria} (rama ${RAMA_MEMORIA}); proyectos: ${proyectos.length}.`);

const [orden, ...args] = process.argv.length > 2 ? process.argv.slice(2) : [process.execPath, 'scripts/verificar.mjs'];
const r = spawnSync(orden, args, { stdio: 'inherit', env: { ...env, BOVEDA_DIR: memoria, TRABAJO_DIR: trabajo }, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
