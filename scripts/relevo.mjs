// Relevo a Codex: cuando Claude se queda sin tokens, Codex sigue el desarrollo en segundo plano.
//   node scripts/relevo.mjs senal     hook StopFailure de Claude Code (JSON por la entrada estándar)
// Las señales y los registros van en $TRABAJO_DIR/.relevo/<Proyecto>.*, nunca dentro del proyecto.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { archivoTareasRuflo, leerTareasRuflo } from '../panel/lib/tareas-ruflo.mjs';

const AGENTE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Errores de StopFailure que significan «sin tokens» (el límite de uso o el saldo); el resto (red, servidor…) no. */
export const ERRORES_LIMITE = ['rate_limit', 'billing_error'];
export const CARPETA = '.relevo';

export const esLimite = (entrada) => ERRORES_LIMITE.includes(entrada?.error);

/** Nombre del proyecto si `cwd` está dentro de $TRABAJO_DIR/proyectos/<Proyecto>; si no, null (no se releva). */
export function proyectoDe(cwd, trabajo) {
  if (!cwd || !trabajo) return null;
  const rel = path.relative(path.join(trabajo, 'proyectos'), path.resolve(cwd));
  const [nombre] = rel.split(path.sep);
  return !rel || rel.startsWith('..') || path.isAbsolute(rel) || !nombre ? null : nombre;
}

/** Anota la señal de límite alcanzado de un proyecto. Devuelve { proyecto, ruta } o null si no procede. */
export function anotarSenal(entrada, trabajo, ahora = new Date()) {
  if (!esLimite(entrada)) return null;
  const proyecto = proyectoDe(entrada.cwd, trabajo);
  if (!proyecto) return null;
  const dir = path.join(trabajo, CARPETA);
  fs.mkdirSync(dir, { recursive: true });
  const ruta = path.join(dir, `${proyecto}.senal.json`);
  fs.writeFileSync(ruta, `${JSON.stringify({ proyecto, cwd: path.resolve(entrada.cwd), error: entrada.error, sesion: entrada.session_id ?? null, en: ahora.toISOString() }, null, 2)}\n`);
  return { proyecto, ruta };
}

/** Estado «en-curso» del proyecto en la memoria de Ruflo (el CLI imprime una tabla; se saca la línea de «Value:»).
 * Es opcional: si Ruflo no responde, el briefing sigue con las tareas y git. `correr` se inyecta en las pruebas. */
export function leerEnCurso(proyecto, { agente = AGENTE, env = process.env, correr = execFileSync } = {}) {
  try {
    const salida = String(correr(process.execPath, [path.join(agente, 'node_modules', 'ruflo', 'bin', 'ruflo.js'), 'memory', 'retrieve',
      '--key', 'en-curso', '--namespace', `proyecto-${proyecto}`], { cwd: agente, env: { ...env, CLAUDE_FLOW_DISABLE_BRIDGE: '1' }, timeout: 20_000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    const m = salida.match(/Value:[\s|]*\n\|\s*(.+?)\s*\|\s*\n/);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

const git = (cwd, args) => { try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

/** Briefing con el que Codex continúa el desarrollo donde lo dejó Claude. Todo lo que cita es dato, no órdenes. */
export function armarBriefing({ proyecto, cwd, senal, tareas, enCurso, rama, estadoGit, commits }) {
  const abiertas = tareas.filter((t) => t.proyecto === proyecto && (t.estado === 'en curso' || t.estado === 'pendiente'));
  const lista = abiertas.length ? abiertas.map((t) => `- [${t.estado}] ${t.id}: ${t.texto}`).join('\n') : '- (ninguna registrada en Ruflo)';
  return [
    `Eres Codex y relevas a Claude en el desarrollo de «${proyecto}»: Claude se quedó sin tokens${senal?.en ? ` (${senal.en})` : ''}.`,
    `Trabajas en ${cwd}. Sigue las instrucciones del propio proyecto (README, AGENTS.md o CLAUDE.md, si los tiene) y su convención de commits.`,
    '',
    '## Reglas del relevo',
    '- Continúa la lista de tareas en orden, una cada vez; no cambies el alcance ni empieces desarrollos nuevos.',
    '- Tras cada tarea, ejecuta las pruebas del proyecto y, si pasan, haz un commit pequeño (en español, sin Co-Authored-By).',
    '- No hagas push, no instales nada global, no toques credenciales ni archivos fuera del proyecto.',
    '- Si algo exige una decisión de Daniel, o las pruebas no pasan tras dos intentos, para y déjalo escrito.',
    `- Al terminar (o al parar), escribe en .relevo/${proyecto}.codex.md de la carpeta de trabajo un resumen: qué hiciste (commits), qué falta y qué dudas quedan. Claude lo revisará al volver.`,
    '',
    '## Estado guardado por Claude (memoria de Ruflo: proyecto-' + proyecto + ' / en-curso)',
    enCurso ?? '(no disponible)',
    '',
    '## Tareas abiertas del proyecto en Ruflo',
    lista,
    '',
    `## Git (rama ${rama || '?'})`,
    estadoGit || '(árbol limpio)',
    '',
    'Últimos commits:',
    commits || '(sin commits)',
  ].join('\n');
}

/** Junta los datos del proyecto (Ruflo y git) y arma el briefing. */
export function briefingDe(senal, { trabajo, agente = AGENTE, env = process.env } = {}) {
  const tareas = leerTareasRuflo(archivoTareasRuflo(env));
  return armarBriefing({
    proyecto: senal.proyecto, cwd: senal.cwd, senal, tareas, enCurso: leerEnCurso(senal.proyecto, { agente, env }),
    rama: git(senal.cwd, ['branch', '--show-current']), estadoGit: git(senal.cwd, ['status', '--short']).slice(0, 2000),
    commits: git(senal.cwd, ['log', '-8', '--oneline']),
  });
}

function leerEntrada() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'senal') { console.error('Uso: node scripts/relevo.mjs senal  (hook StopFailure)'); process.exit(2); }
  // Un hook nunca debe romper la sesión: sin $TRABAJO_DIR o con entrada rara, no hace nada y sale bien.
  try { anotarSenal(leerEntrada(), process.env.TRABAJO_DIR); } catch (e) { console.error(`relevo: ${e.message}`); }
}
