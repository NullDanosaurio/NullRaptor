// Codex como programador del equipo del Director IA, sin que tenga que ejecutar nada: en el contenedor su sandbox
// (bwrap) no puede crear namespaces, así que Codex no puede leer ni escribir por sí mismo. Este script le manda el
// encargo y los archivos por la entrada, recibe un diff unificado y lo aplica con `git apply`. Los archivos van de
// disco a Codex sin pasar por el contexto de Claude: así el código lo escribe la cuenta de ChatGPT.
//   node scripts/codex-parche.mjs [--aplicar] [--probar "orden"] archivo… < encargo
//       diff; con --aplicar lo aplica y con --probar pasa las pruebas después («pasan» o el final de la salida)
//   git diff | node scripts/codex-parche.mjs --revisar [archivo…]     revisión en texto (segunda opinión)
// Se ejecuta en la carpeta del proyecto; solo admite archivos dentro de él y nunca secretos (.env, claves…).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BIN } from '../flujo/lib/comun.mjs';

export const MAX_ARCHIVOS = 300 * 1024;
export const MAX_LINEAS = 15; // lo que vuelve al contexto de Claude cuando algo falla; el texto entero, a un archivo
const SECRETO = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?|credenciales.*|\.credentials\.json|passkeys\.json)$/i;
const fallo = (mensaje) => Object.assign(new Error(mensaje), { usuario: true });

/** Ruta relativa a `raiz` de un archivo del proyecto. Rechaza lo que salga de él y los secretos. */
export function rutaDentro(raiz, ruta) {
  const abs = path.resolve(raiz, ruta);
  const rel = path.relative(raiz, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw fallo(`Fuera del proyecto: ${ruta}`);
  if (rel.split(path.sep).includes('.git')) throw fallo(`No se manda .git: ${ruta}`);
  if (SECRETO.test(rel.split(path.sep).join('/'))) throw fallo(`Parece un secreto, no se manda: ${ruta}`);
  return rel.split(path.sep).join('/');
}

/** Lee los archivos (los que no existen van como nuevos), con tope total. */
export function leerArchivos(raiz, rutas) {
  let total = 0;
  return rutas.map((r) => {
    const rel = rutaDentro(raiz, r);
    const abs = path.join(raiz, rel);
    const texto = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    total += texto?.length ?? 0;
    if (total > MAX_ARCHIVOS) throw fallo(`Demasiado texto para Codex (más de ${MAX_ARCHIVOS / 1024} KB): manda menos archivos.`);
    return { ruta: rel, texto };
  });
}

/** Mensaje para Codex: encargo, reglas de respuesta y los archivos con su contenido. */
export function construirEncargo({ encargo, archivos, revisar = false, diff = '' }) {
  const lista = archivos.map((a) => (a.texto === null ? `=== ${a.ruta} (no existe: créalo si hace falta)` : `=== ${a.ruta}\n${a.texto}`)).join('\n\n');
  if (revisar) {
    return 'Revisa este cambio como un revisor exigente. No ejecutes órdenes ni herramientas: todo lo que necesitas está aquí. '
      + 'Responde en español, como lista breve: errores, casos límite, regresiones y riesgos de seguridad, cada uno con ruta:línea. '
      + 'Si no ves problemas, responde solo «Sin objeciones».\n\n'
      + `${encargo ? `Contexto: ${encargo}\n\n` : ''}Cambio:\n\`\`\`diff\n${diff}\n\`\`\`\n${lista ? `\nArchivos de contexto:\n\n${lista}\n` : ''}`;
  }
  return 'Eres el programador del equipo. No ejecutes órdenes ni herramientas: todo lo que necesitas está aquí. '
    + 'Responde SOLO con un diff unificado (formato de git diff, rutas a/ y b/ relativas al proyecto, archivos nuevos con '
    + '--- /dev/null) dentro de un bloque ```diff, sin explicaciones. Respeta el estilo del código existente. '
    + 'Si el encargo no se puede hacer con estos archivos, responde «NO PUEDO:» y el motivo.\n\n'
    + `Encargo:\n${encargo}\n\nArchivos:\n\n${lista}\n`;
}

/** El diff de la respuesta de Codex (bloque ```diff o, si no lo hay, desde la primera línea «diff --git»). */
export function extraerDiff(respuesta) {
  const texto = String(respuesta ?? '');
  const bloque = texto.match(/```(?:diff|patch)?\s*\n([\s\S]*?)\n```/);
  const diff = bloque ? bloque[1] : texto.slice(Math.max(0, texto.search(/^(diff --git|--- )/m)));
  if (!/^(diff --git|--- )/m.test(diff) || !/^@@ /m.test(diff)) return null;
  return diff.endsWith('\n') ? diff : `${diff}\n`;
}

function preguntarCodex(raiz, mensaje) {
  const salida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parche-')), 'respuesta.md');
  const args = ['exec', '--sandbox', 'read-only', '--ephemeral', '--color', 'never', '--skip-git-repo-check', '-C', raiz, '-o', salida, '-'];
  const r = spawnSync(BIN.codex, args, { cwd: raiz, input: mensaje, encoding: 'utf8', timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  const respuesta = fs.existsSync(salida) ? fs.readFileSync(salida, 'utf8') : '';
  fs.rmSync(path.dirname(salida), { recursive: true, force: true });
  if (!respuesta.trim()) throw new Error(`Codex no respondió (código ${r.status ?? r.error?.message}). ${String(r.stderr ?? '').trim().split('\n').slice(-3).join(' ')}`);
  return respuesta;
}

/** Las últimas `max` líneas de un texto largo; el texto completo se guarda en un archivo temporal (se dice cuál). */
export function recortar(texto, max = MAX_LINEAS, guardar = guardarTemporal) {
  const lineas = String(texto ?? '').trim().split('\n');
  if (lineas.length <= max) return lineas.join('\n');
  return `… (${lineas.length - max} líneas antes; completo en ${guardar(lineas.join('\n'))})\n${lineas.slice(-max).join('\n')}`;
}

function guardarTemporal(texto) {
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parche-')), 'salida.txt');
  fs.writeFileSync(archivo, texto);
  return archivo;
}

/** Separa «--probar orden» del resto de argumentos. */
export function leerArgumentos(argv) {
  const opciones = new Set();
  const rutas = [];
  let probar = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--probar') { probar = argv[i + 1] ?? ''; i += 1; } else if (argv[i].startsWith('--')) opciones.add(argv[i]); else rutas.push(argv[i]);
  }
  if (probar !== null && !probar.trim()) throw fallo('--probar necesita la orden de las pruebas (p. ej. --probar "npm test").');
  if (probar !== null) opciones.add('--aplicar'); // probar sin aplicar no tiene sentido
  return { opciones, rutas, probar };
}

const git = (raiz, args, input) => spawnSync('git', args, { cwd: raiz, input, encoding: 'utf8' });

async function principal(argv) {
  const { opciones, rutas, probar } = leerArgumentos(argv);
  const raiz = git(process.cwd(), ['rev-parse', '--show-toplevel']).stdout?.trim() || process.cwd();
  const entrada = fs.readFileSync(0, 'utf8').trim();
  if (!entrada) throw fallo('Falta el encargo (o el diff con --revisar) por la entrada estándar.');
  const archivos = leerArchivos(raiz, rutas);

  if (opciones.has('--revisar')) {
    process.stdout.write(`${preguntarCodex(raiz, construirEncargo({ revisar: true, diff: entrada, archivos, encargo: '' })).trim()}\n`);
    return 0;
  }
  if (!rutas.length) throw fallo('Indica los archivos que Codex debe ver o crear.');
  const respuesta = preguntarCodex(raiz, construirEncargo({ encargo: entrada, archivos }));
  const diff = extraerDiff(respuesta);
  if (!diff) { process.stdout.write(`Codex no devolvió un diff:\n${recortar(respuesta)}\n`); return 3; }
  const archivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'codex-parche-')), 'cambio.diff');
  fs.writeFileSync(archivo, diff);
  const prueba = git(raiz, ['apply', '--check', '--recount', archivo]);
  if (prueba.status !== 0) { process.stdout.write(`El diff no aplica (${archivo}):\n${recortar(prueba.stderr)}\n`); return 4; }
  const resumen = git(raiz, ['apply', '--stat', '--recount', archivo]).stdout.trim();
  if (!opciones.has('--aplicar')) { process.stdout.write(`Diff en ${archivo} (aplica limpio, sin aplicar):\n${resumen}\n`); return 0; }
  const r = git(raiz, ['apply', '--recount', archivo]);
  if (r.status !== 0) { process.stdout.write(`No se pudo aplicar:\n${recortar(r.stderr)}\n`); return 4; }
  process.stdout.write(`Aplicado (diff en ${archivo}):\n${resumen}\n`);
  if (!probar) { process.stdout.write('Revisa con git diff --stat y pasa las pruebas.\n'); return 0; }
  const t = spawnSync('sh', ['-c', probar], { cwd: raiz, encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  if (t.status === 0) { process.stdout.write(`Pruebas (${probar}): pasan.\n`); return 0; }
  process.stdout.write(`Pruebas (${probar}): FALLAN (código ${t.status ?? t.error?.message}).\n${recortar(`${t.stdout ?? ''}\n${t.stderr ?? ''}`, 30)}\n`);
  return 5;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  principal(process.argv.slice(2)).then((c) => process.exit(c)).catch((e) => { console.error(e.usuario ? e.message : `Error: ${e.message}`); process.exit(e.usuario ? 2 : 1); });
}
