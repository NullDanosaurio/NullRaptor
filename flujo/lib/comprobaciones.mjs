// Comprobaciones independientes del implementador, ejecutadas por el coordinador.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { BIN, MIN, entornoSeguro, ejecutar, git, recortar } from './comun.mjs';

/** Puerto TCP libre en 127.0.0.1 para el servidor de las e2e (evita choques entre rondas). */
function puertoLibre() {
  return new Promise((resolve, reject) => {
    const servidor = net.createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });
}

/** Cierra procesos que sigan escuchando en el puerto (servidores huérfanos de Playwright). */
function liberarPuerto(puerto) {
  if (process.platform !== 'win32') return;
  const r = spawnSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', windowsHide: true });
  const pids = new Set((r.stdout ?? '').split('\n')
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[1]?.endsWith(`:${puerto}`) && /LISTEN/i.test(c[3] ?? ''))
    .map((c) => c[4])
    .filter((pid) => pid && pid !== '0'));
  for (const pid of pids) spawnSync('taskkill', ['/pid', pid, '/t', '/f'], { windowsHide: true });
}

// Texto UTF-8 mal convertido (p. ej. «decisiÃ³n», «â€”»): delata guardados en ANSI/Latin-1.
const MOJIBAKE = /Ã[\u0080-¿]|Ã[¡-¿]|â€|Â[ -¿]/;

/** Devuelve los problemas de codificación de los archivos de texto indicados. */
export function problemasDeCodificacion(wt, archivos) {
  const problemas = [];
  const decodificador = new TextDecoder('utf-8', { fatal: true });
  for (const archivo of archivos) {
    if (!/\.(tsx?|mjs|js|css|md|json)$/.test(archivo)) continue;
    const ruta = path.join(wt, archivo);
    if (!fs.existsSync(ruta)) continue;
    let texto;
    try {
      texto = decodificador.decode(fs.readFileSync(ruta));
    } catch {
      problemas.push(`${archivo}: no es UTF-8 válido`);
      continue;
    }
    texto.split('\n').forEach((linea, i) => {
      if (MOJIBAKE.test(linea)) problemas.push(`${archivo}:${i + 1}: texto mal codificado «${linea.trim().slice(0, 80)}»`);
    });
  }
  return problemas;
}

// Lo que define cómo se juzga un cambio: no puede diferir de la base.
export const PROTEGIDOS = [
  'tests', 'tareas', 'scripts', 'config', 'package.json', 'package-lock.json', 'tsconfig.json',
  'next.config.ts', 'playwright.config.ts', 'postcss.config.mjs',
];

function integridad(wt, base) {
  const modificados = git(['diff', '--name-only', base, '--', ...PROTEGIDOS], wt).split('\n').filter(Boolean);
  const nuevos = git(['ls-files', '--others', '--exclude-standard', '--', ...PROTEGIDOS], wt).split('\n').filter(Boolean);
  return [...modificados, ...nuevos];
}

// Pruebas que se ejecutan: todas menos las de tareas pendientes (que aún no
// pueden pasar). Así se comprueban la tarea actual y la regresión de las integradas.
const listar = (wt, patron, excluir) => fs.globSync(patron, { cwd: wt })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => !excluir.includes(p))
  .sort();

/** Devuelve { ok, resultado, diagnostico, superadas, pruebas }. */
export async function comprobar({ wt, dir, n, base, e2e = true, excluir = [] }) {
  const alterados = integridad(wt, base);
  if (alterados.length) {
    return {
      ok: false,
      resultado: { integridad: false },
      diagnostico: `Archivos protegidos (pruebas, criterios o configuración) alterados: ${alterados.join(', ')}`,
      superadas: [],
    };
  }
  const unitarias = listar(wt, 'tests/unit/**/*.test.ts', excluir);
  const extremo = listar(wt, 'tests/e2e/**/*.spec.ts', excluir);
  const pasos = [['typecheck', [BIN.tsc, '--noEmit'], 4 * MIN]];
  if (unitarias.length) pasos.push(['pruebas', ['--test', ...unitarias], 4 * MIN]);
  pasos.push(['build', [BIN.next, 'build'], 10 * MIN]);
  if (e2e && extremo.length) pasos.push(['e2e', [BIN.playwright, 'test', '--reporter=line', ...extremo], 15 * MIN]);
  const resultado = { integridad: true, pruebasEjecutadas: [...unitarias, ...(e2e ? extremo : [])] };
  const superadas = ['integridad de pruebas y configuración'];
  for (const [nombre, args, timeoutMs] of pasos) {
    let env;
    let puerto = null;
    if (nombre === 'e2e') {
      puerto = await puertoLibre();
      env = { ...entornoSeguro(), PUERTO_E2E: String(puerto) };
    }
    const r = await ejecutar(BIN.node, args, { cwd: wt, timeoutMs, env, log: path.join(dir, `intento-${n}-${nombre}.log`) });
    if (puerto) liberarPuerto(puerto);
    if (r.cancelado) return { ok: false, cancelado: true, resultado, superadas };
    resultado[nombre] = r.code === 0;
    if (r.code !== 0) {
      return { ok: false, resultado, superadas, diagnostico: `Falló ${nombre}:\n${recortar(`${r.out}\n${r.err}`, 6000)}` };
    }
    superadas.push(nombre);
  }
  return { ok: true, resultado, superadas };
}
