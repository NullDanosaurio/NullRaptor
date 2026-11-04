// Relevo a Codex: cuando Claude se queda sin tokens, Codex sigue el desarrollo en segundo plano.
//   node scripts/relevo.mjs senal     hook StopFailure de Claude Code (JSON por la entrada estándar): anota la señal y
//                                     deja a Codex trabajando en segundo plano (ejecutar)
//   node scripts/relevo.mjs ejecutar <Proyecto>   corre Codex con el briefing hasta que acaba (lo lanza «senal»)
// Codex usa el sandbox workspace-write; en el contenedor hace falta el perfil seccomp de AHO-5 (bwrap necesita
// namespaces). Solo con RELEVO_SIN_SANDBOX=1 (decisión de Daniel) se ejecuta sin sandbox: el contenedor es el límite.
// Las señales y los registros van en $TRABAJO_DIR/.relevo/<Proyecto>.*, nunca dentro del proyecto.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { archivoTareasRuflo, leerTareasRuflo } from '../panel/lib/tareas-ruflo.mjs';

const HORAS = 3_600_000;
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

const rutaDe = (trabajo, proyecto, ext) => path.join(trabajo, CARPETA, `${proyecto}.${ext}`);
const leerJson = (ruta) => { try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return null; } };
const escribirJson = (ruta, datos) => fs.writeFileSync(ruta, `${JSON.stringify(datos, null, 2)}\n`);
const vivo = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Estado del relevo de un proyecto: { estado: 'en curso' | 'terminado' | 'error', pid, inicio, fin, codigo } o null. */
export const estadoRelevo = (trabajo, proyecto) => {
  const e = leerJson(rutaDe(trabajo, proyecto, 'estado.json'));
  // Un «en curso» cuyo proceso ya no existe (reinicio del contenedor) cuenta como interrumpido.
  return e?.estado === 'en curso' && !vivo(e.pid) ? { ...e, estado: 'error', error: 'interrumpido' } : e;
};

/** Binario de Codex: RUFLO_CODEX_EXE, el del agente o el del PATH. */
export function binarioCodex(agente = AGENTE, env = process.env) {
  const local = path.join(agente, 'node_modules', '.bin', 'codex');
  return env.RUFLO_CODEX_EXE && fs.existsSync(env.RUFLO_CODEX_EXE) ? env.RUFLO_CODEX_EXE : fs.existsSync(local) ? local : 'codex';
}

/** Argumentos de `codex exec` para el relevo. La salida final y el resumen van en la carpeta .relevo (fuera del proyecto). */
export function argsCodex({ cwd, dirRelevo, salida, sinSandbox = false }) {
  const sandbox = sinSandbox ? ['--dangerously-bypass-approvals-and-sandbox']
    : ['--sandbox', 'workspace-write', '-c', 'sandbox_workspace_write.network_access=false', '--add-dir', dirRelevo];
  return ['exec', ...sandbox, '--ephemeral', '--color', 'never', '-C', cwd, '-o', salida, '-'];
}

/** Lanza el relevo en segundo plano (proceso aparte, que sobrevive al hook). Una sola vez por proyecto mientras
 * Codex siga trabajando. Devuelve { lanzado, motivo? }. `arrancar` se inyecta en las pruebas. */
export function lanzar(senal, { trabajo, agente = AGENTE, env = process.env, arrancar = spawn } = {}) {
  if (estadoRelevo(trabajo, senal.proyecto)?.estado === 'en curso') return { lanzado: false, motivo: 'ya hay un relevo en curso' };
  const hijo = arrancar(process.execPath, [path.join(agente, 'scripts', 'relevo.mjs'), 'ejecutar', senal.proyecto],
    { cwd: senal.cwd, detached: true, stdio: 'ignore', env: { ...env, TRABAJO_DIR: trabajo } });
  hijo.unref?.();
  escribirJson(rutaDe(trabajo, senal.proyecto, 'estado.json'), { estado: 'en curso', pid: hijo.pid, inicio: new Date().toISOString() });
  return { lanzado: true, pid: hijo.pid };
}

/** Corre Codex con el briefing hasta que acaba (o pasa de 3 h) y deja el resultado en el estado. */
export async function ejecutar(proyecto, { trabajo, agente = AGENTE, env = process.env, arrancar = spawn, limite = 3 * HORAS } = {}) {
  const senal = leerJson(rutaDe(trabajo, proyecto, 'senal.json'));
  if (!senal) throw new Error(`No hay señal de límite para ${proyecto}.`);
  const dir = path.join(trabajo, CARPETA);
  const briefing = rutaDe(trabajo, proyecto, 'briefing.md');
  const resumen = rutaDe(trabajo, proyecto, 'codex.md');
  fs.writeFileSync(briefing, briefingDe({ ...senal, resumen }, { trabajo, agente, env }));
  const log = fs.openSync(rutaDe(trabajo, proyecto, 'log'), 'a');
  const inicio = new Date().toISOString();
  const estado = (datos) => escribirJson(rutaDe(trabajo, proyecto, 'estado.json'), { pid: process.pid, inicio, ...datos });
  estado({ estado: 'en curso' });
  const args = argsCodex({ cwd: senal.cwd, dirRelevo: dir, salida: rutaDe(trabajo, proyecto, 'final.md'), sinSandbox: env.RELEVO_SIN_SANDBOX === '1' });
  const codigo = await new Promise((listo) => {
    const hijo = arrancar(binarioCodex(agente, env), args, { cwd: senal.cwd, stdio: [fs.openSync(briefing, 'r'), log, log], env });
    const reloj = setTimeout(() => hijo.kill('SIGTERM'), limite);
    hijo.on('error', (e) => { clearTimeout(reloj); fs.writeSync(log, `No se pudo lanzar Codex: ${e.message}\n`); listo(-1); });
    hijo.on('exit', (code) => { clearTimeout(reloj); listo(code ?? -1); });
  });
  fs.closeSync(log);
  estado({ estado: codigo === 0 ? 'terminado' : 'error', fin: new Date().toISOString(), codigo });
  return codigo;
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
export function armarBriefing({ proyecto, cwd, senal, tareas, enCurso, rama, estadoGit, commits, resumen = `.relevo/${proyecto}.codex.md` }) {
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
    `- Al terminar (o al parar), escribe en ${resumen} un resumen: qué hiciste (commits), qué falta y qué dudas quedan. Claude lo revisará al volver.`,
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
    proyecto: senal.proyecto, cwd: senal.cwd, senal, resumen: senal.resumen, tareas, enCurso: leerEnCurso(senal.proyecto, { agente, env }),
    rama: git(senal.cwd, ['branch', '--show-current']), estadoGit: git(senal.cwd, ['status', '--short']).slice(0, 2000),
    commits: git(senal.cwd, ['log', '-8', '--oneline']),
  });
}

function leerEntrada() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [, , orden, proyecto] = process.argv;
  const trabajo = process.env.TRABAJO_DIR;
  if (orden === 'ejecutar' && proyecto && trabajo) {
    process.exit(Math.max(0, await ejecutar(proyecto, { trabajo }).catch((e) => { console.error(`relevo: ${e.message}`); return 1; })));
  } else if (orden === 'senal') {
    // Un hook nunca debe romper la sesión: sin $TRABAJO_DIR o con entrada rara, no hace nada y sale bien.
    try {
      const senal = anotarSenal(leerEntrada(), trabajo);
      if (senal) lanzar(JSON.parse(fs.readFileSync(senal.ruta, 'utf8')), { trabajo });
    } catch (e) { console.error(`relevo: ${e.message}`); }
  } else { console.error('Uso: node scripts/relevo.mjs senal | ejecutar <Proyecto>'); process.exit(2); }
}
