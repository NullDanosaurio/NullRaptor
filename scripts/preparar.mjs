// Arranque del agente: abre el cofre con una clave, clona o actualiza su memoria (Obsidian) y, según el modo:
//  - con orden:              node scripts/preparar.mjs <orden...>   → la ejecuta en /nullraptor
//  - en terminal, sin orden: menú de proyectos → Claude Code dentro del proyecto elegido
//  - sin terminal ni orden:  scripts/verificar.mjs
// Configuración (en el cofre o en el entorno; el entorno manda): MEMORIA_REPO (obligatoria), GITHUB_ORG,
// GITHUB_TOKEN, CLAUDE_CODE_OAUTH_TOKEN, AGENTE_GIT_NOMBRE, AGENTE_GIT_EMAIL, TRABAJO_DIR, CREDENCIALES.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { abrirCofre } from './credenciales.mjs';
import { elegirProyecto, opcionesDelMenu } from './menu.mjs';
import { prepararIA } from './ia.mjs';
import { explorarDelDia, leerEstado } from './mcp.mjs';

const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAMA_MEMORIA = 'agente'; // el agente nunca escribe en main: Daniel fusiona.

// Bienvenida, solo en terminal.
if (process.stdin.isTTY) console.error(String.raw`
               __
              / _)     N U L L R A P T O R
     _.----._/ /       agente personal · memoria + proyectos
    /         /
 __/ (  | (  |
/__.-'|_|--|_|
`);

// El cofre nunca va en el repo ni en la imagen: vive en cada equipo (en Docker, montado en /cofre).
const rutaCofre = process.env.CREDENCIALES ?? path.join(os.homedir(), '.nullraptor', 'credenciales.cifrado');
const cofre = fs.existsSync(rutaCofre) ? await abrirCofre(rutaCofre).catch((e) => { console.error(e.message); process.exit(1); }) : {};
// Sin autoactualización: la versión de Claude va fijada en package.json, y en Windows el actualizador aparta
// claude.exe (claude.exe.old.*) sin dejar el nuevo, así que el siguiente arranque fallaba.
const env = { ...cofre, ...process.env, GIT_TERMINAL_PROMPT: '0', DISABLE_AUTOUPDATER: '1' };
delete env.AGENTE_CLAVE; // la clave no pasa a los procesos hijos
// Autor de los commits del agente en memoria y proyectos (el flujo hace commits en los proyectos).
if (env.AGENTE_GIT_NOMBRE) env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = env.AGENTE_GIT_NOMBRE;
if (env.AGENTE_GIT_EMAIL) env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = env.AGENTE_GIT_EMAIL;

const trabajo = path.resolve(env.TRABAJO_DIR ?? '/trabajo');
if (!env.MEMORIA_REPO) { console.error(`Falta MEMORIA_REPO. ¿Está el cofre en ${rutaCofre}? (ver «Cofre de credenciales» en LEEME.md)`); process.exit(1); }

// El token va por variables de entorno de git: no queda en disco, en .git/config ni en los argumentos.
if (env.GITHUB_TOKEN) {
  const basic = Buffer.from(`x-access-token:${env.GITHUB_TOKEN}`).toString('base64');
  Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` });
}
const git = (args, cwd) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
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
    console.error(`Descargando ${url}…`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    git(['clone', '-c', 'core.longpaths=true', url, destino]); // longpaths: nombres largos en Windows
  }
}

// Memoria: rama propia del agente; recibe lo que Daniel fusiona en la principal.
const memoria = path.join(trabajo, 'memoria');
clonarOActualizar(env.MEMORIA_REPO, memoria);
const principal = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], memoria); // p. ej. origin/main
if (git(['rev-parse', '--abbrev-ref', 'HEAD'], memoria) !== RAMA_MEMORIA) {
  git(existe(`origin/${RAMA_MEMORIA}`, memoria) ? ['checkout', '-B', RAMA_MEMORIA, `origin/${RAMA_MEMORIA}`] : ['checkout', '-b', RAMA_MEMORIA], memoria);
}
avanzar(memoria, [`origin/${RAMA_MEMORIA}`, principal]);
if (env.AGENTE_GIT_NOMBRE) git(['config', 'user.name', env.AGENTE_GIT_NOMBRE], memoria);
if (env.AGENTE_GIT_EMAIL) git(['config', 'user.email', env.AGENTE_GIT_EMAIL], memoria);
console.error(`Memoria lista (rama ${RAMA_MEMORIA}).`);

// Instrucciones globales y MCP de la IA, desde fuera de los proyectos (también para las sesiones del panel).
const mcp = prepararIA({ agente, env, memoria, trabajo });

const ejecutar = (orden, args, cwd) => spawnSync(orden, args, { cwd, stdio: 'inherit', env: { ...env, BOVEDA_DIR: memoria, TRABAJO_DIR: trabajo }, shell: /\.(cmd|bat)$/i.test(orden) }).status ?? 1; // shell solo para .cmd (Windows)

// El propio agente queda descargado como proyecto desde el primer arranque (menú y panel; no en la verificación).
if (process.argv.length > 2 || process.stdin.isTTY) {
  const [nullraptor] = opcionesDelMenu(memoria, env.AGENTE_REPO);
  try { clonarOActualizar(nullraptor.repo, path.join(trabajo, 'proyectos', nullraptor.nombre)); }
  catch (e) { console.warn(`Aviso: no se pudo descargar ${nullraptor.nombre} (${e.message.split('\n')[0]}).`); }
}

if (process.argv.length > 2) process.exit(ejecutar(process.argv[2], process.argv.slice(3), agente));
if (!process.stdin.isTTY) process.exit(ejecutar(process.execPath, ['scripts/verificar.mjs'], agente));

// Hueco diario: recomendar 3 servidores MCP (una vez al día; si falla, se sigue sin ellos).
try {
  const yaHoy = leerEstado(memoria).ultimaExploracion === new Date().toISOString().slice(0, 10);
  if (!yaHoy) console.error('Buscando los servidores MCP recomendados de hoy…');
  const elegidos = await explorarDelDia(memoria);
  if (elegidos && !yaHoy) {
    git(['add', 'MCP'], memoria);
    git(['commit', '-m', `MCP recomendados ${new Date().toISOString().slice(0, 10)}`], memoria);
    try { git(['push', '-u', 'origin', 'HEAD'], memoria); } catch { console.warn('Aviso: recomendaciones guardadas en local; no se pudo subir la memoria.'); }
    console.error('Hoy tienes 3 servidores MCP recomendados: opción «m» del menú.');
  }
} catch (e) { console.warn(`Aviso: sin recomendaciones MCP hoy (${e.message}).`); }

const proyecto = await elegirProyecto({ memoria, trabajo, env, git, clonar: clonarOActualizar });
if (!proyecto) process.exit(0);

const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
const modo = (await rl.question('\nIntro = Claude Code · c = chat con Claude y Codex: ')).trim().toLowerCase();
rl.close();
if (modo === 'c') process.exit(ejecutar(process.execPath, [path.join(agente, 'scripts', 'chat.mjs'), proyecto], proyecto));

// Con sesión de claude.ai guardada (/login), se usa esa: el token de setup-token no carga los conectores de claude.ai.
// shortcut: en macOS la sesión va en el llavero y no en este archivo, así que allí se sigue usando el token.
if (fs.existsSync(path.join(env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), '.credentials.json'))) delete env.CLAUDE_CODE_OAUTH_TOKEN;
const claude = path.join(agente, 'node_modules', '.bin', process.platform === 'win32' ? 'claude.cmd' : 'claude');
process.exit(ejecutar(claude, ['--mcp-config', mcp, '--add-dir', memoria], proyecto));
