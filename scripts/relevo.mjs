// Relevo a Codex: cuando Claude se queda sin tokens, Codex sigue el desarrollo en segundo plano.
//   node scripts/relevo.mjs senal     hook StopFailure de Claude Code (JSON por la entrada estándar)
// Las señales y los registros van en $TRABAJO_DIR/.relevo/<Proyecto>.*, nunca dentro del proyecto.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

function leerEntrada() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8')); } catch { return null; }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv[2] !== 'senal') { console.error('Uso: node scripts/relevo.mjs senal  (hook StopFailure)'); process.exit(2); }
  // Un hook nunca debe romper la sesión: sin $TRABAJO_DIR o con entrada rara, no hace nada y sale bien.
  try { anotarSenal(leerEntrada(), process.env.TRABAJO_DIR); } catch (e) { console.error(`relevo: ${e.message}`); }
}
