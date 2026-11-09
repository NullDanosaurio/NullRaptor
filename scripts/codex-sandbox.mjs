// Perfil de sandbox de Codex (permisos por ruta) compartido por las sesiones del panel/terminal y el relevo.
// Sustituye a `--sandbox workspace-write` (incompatible con default_permissions): raíz de solo lectura, el proyecto
// escribible y los secretos ocultos (none). La ruta más específica gana. Receta verificada con `codex sandbox` 0.163.0.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PERFIL = 'nr';
const q = (s) => JSON.stringify(s); // cadena TOML básica

/** Rutas que ni Claude ni Codex deben leer ni escribir (cofre, credenciales, passkeys, registros...). Las usan
 * las reglas deny de Claude (remoto.mjs) y el perfil de Codex. */
export function rutasProtegidas({ env, configDir, trabajo }) {
  const cofre = path.dirname(path.resolve(env.CREDENCIALES ?? path.join(os.homedir(), '.nullraptor', 'credenciales.cifrado')));
  const nullraptor = path.join(env.HOME ?? os.homedir(), '.nullraptor');
  return {
    carpetas: [cofre, nullraptor, path.join(trabajo, 'registros')],
    archivos: [path.join(configDir, '.credentials.json'), path.join(configDir, '.claude.json')],
  };
}

/** Argumentos `-c` del perfil de Codex. Pura salvo por `existe` (inyectable): las rutas «none» y las de solo lectura
 * que no existen se omiten, porque el sandbox crearía marcadores vacíos en ellas.
 * - ruta: proyecto (escribible); escribibles: más rutas escribibles (adjuntos, carpeta del relevo, /tmp...).
 * - env/configDir/trabajo: de dónde salen los secretos a ocultar. */
export function argsSandboxCodex({ ruta, escribibles = [], env = process.env, configDir = env.CLAUDE_CONFIG_DIR, trabajo, existe = fs.existsSync }) {
  const permisos = new Map([[':root', 'read']]);
  const poner = (p, modo) => { if (p) permisos.set(path.resolve(p), modo); };
  for (const p of [ruta, ...escribibles, os.tmpdir(), '/tmp']) poner(p, 'write');
  const git = path.join(ruta, '.git');
  if (existe(git) && fs.statSync(git).isDirectory()) { // los worktrees (.git archivo) no se tocan
    poner(git, 'write'); // sin esto no se crean objetos ni se hacen commits
    // hooks y config en solo lectura: si no, Codex podría dejar código que se ejecuta fuera del sandbox (al hacer git).
    for (const n of ['hooks', 'config']) if (existe(path.join(git, n))) poner(path.join(git, n), 'read');
  }
  const secretos = [];
  if (trabajo) {
    const { carpetas, archivos } = rutasProtegidas({ env, configDir: configDir ?? path.join(env.HOME ?? os.homedir(), '.claude'), trabajo });
    secretos.push(...carpetas, ...archivos, path.join(trabajo, '.mcp-agente.json'));
  }
  if (configDir) secretos.push(configDir); // ~/.claude entero: credenciales y sesiones de Claude
  secretos.push(path.join(env.CODEX_HOME ?? path.join(env.HOME ?? os.homedir(), '.codex'), 'auth.json'));
  // Un «none» dentro de otro «none» hace fallar a bwrap: solo se deja el más externo.
  const ocultos = [...new Set(secretos.map((p) => path.resolve(p)))].filter(existe);
  for (const p of ocultos) if (!ocultos.some((o) => o !== p && p.startsWith(`${o}${path.sep}`))) poner(p, 'none');
  const tabla = [...permisos].map(([p, m]) => `${q(p)}=${q(m)}`).join(',');
  return ['-c', `default_permissions=${q(PERFIL)}`, '-c', `permissions.${PERFIL}.filesystem={${tabla}}`, '-c', `permissions.${PERFIL}.network.enabled=false`];
}
