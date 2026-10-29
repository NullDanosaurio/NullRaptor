// Chat de grupo: Dano, Claude y Codex sobre un proyecto, en la terminal.
//   node scripts/chat.mjs <carpeta del proyecto>     (preparar.mjs lo lanza con BOVEDA_DIR y TRABAJO_DIR)
// Sin destinatario contestan las dos, alternando quién empieza; «@claude …» o «@codex …» habla con una; «/fin» cierra.
// Las dos solo leen el proyecto (nunca dos escritores a la vez). La conversación completa queda en el equipo
// ($TRABAJO_DIR/chats, se borra a los 30 días); a la bóveda solo va el resumen, en el Diario.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { BIN, entornoSeguro } from '../flujo/lib/comun.mjs';

export const IAS = ['claude', 'codex'];
const NOMBRE = { dano: 'Dano', claude: 'Claude', codex: 'Codex' };
const DIAS_LOCAL = 30;
const MAX_MENSAJE = 20_000;
const una = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** «@codex hola» → { destino: ['codex'], texto: 'hola' }; sin @, las dos en el orden del turno. */
export function destinatarios(linea, turno) {
  const m = linea.match(/^@(claude|codex)\b\s*(.*)$/is);
  if (m) return { destino: [m[1].toLowerCase()], texto: m[2].trim() };
  return { destino: turno % 2 ? ['codex', 'claude'] : ['claude', 'codex'], texto: linea.trim() };
}

/** Mensajes que una IA aún no ha visto (incluidas las respuestas de la otra), listos para su siguiente turno. */
export function pendientes(historial, vistos, ia, proyecto) {
  const nuevos = historial.slice(vistos).map((m) => `[${NOMBRE[m.quien]}] ${m.texto}`).join('\n\n');
  const otra = NOMBRE[IAS.find((x) => x !== ia)];
  const intro = vistos === 0
    ? `Estás en un chat de grupo con Dano (humano) y ${otra} (otra IA) sobre el proyecto «${proyecto}» (directorio actual). `
      + `Puedes leer el proyecto, no modificarlo. Responde como ${NOMBRE[ia]} (sin poner tu nombre delante), en español y breve; `
      + `si coincides con ${otra} no lo repitas, aporta o discrepa. Mensajes:\n\n`
    : 'Nuevos mensajes del chat desde tu último turno:\n\n';
  return `${intro}${nuevos}`;
}

/** Entrada para el Diario de la bóveda. Valida lo que devuelve Claude: texto corto de una línea. */
export function entradaDiario(proyecto, resumen) {
  const tema = una(resumen?.tema, 80);
  const vinetas = (Array.isArray(resumen?.vinetas) ? resumen.vinetas : []).map((v) => una(v, 300)).filter(Boolean).slice(0, 5);
  if (!tema || !vinetas.length) return null;
  return `\n## [[${proyecto}]] — chat: ${tema}\n${vinetas.map((v) => `- ${v}`).join('\n')}\n`;
}

function preguntarClaude(proyecto, entrada, sesion) {
  const args = ['-p', '--output-format', 'json', '--tools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk', '--strict-mcp-config'];
  if (sesion) args.push('--resume', sesion);
  const r = spawnSync(BIN.claude, args, { cwd: proyecto, input: entrada, encoding: 'utf8', env: entornoSeguro(), timeout: 10 * 60_000, windowsHide: true });
  try {
    const j = JSON.parse(r.stdout);
    if (j.is_error) throw new Error(j.result);
    return { texto: String(j.result ?? '').trim(), sesion: j.session_id ?? sesion };
  } catch (e) { throw new Error(`Claude no respondió (${e.message ?? r.status}). ${una(r.stderr, 200)}`); }
}

function preguntarCodex(proyecto, entrada, sesion, carpeta) {
  const salida = path.join(carpeta, '.codex-ultimo.txt');
  fs.rmSync(salida, { force: true });
  // resume no admite --sandbox: el modo va por configuración, también en la primera llamada.
  const comunes = ['-c', 'sandbox_mode="read-only"', '--skip-git-repo-check', '--json', '-o', salida];
  const args = sesion ? ['exec', 'resume', ...comunes, sesion, '-'] : ['exec', ...comunes, '--color', 'never', '-'];
  const r = spawnSync(BIN.codex, args, { cwd: proyecto, input: entrada, encoding: 'utf8', env: entornoSeguro(), timeout: 10 * 60_000, windowsHide: true });
  const id = r.stdout?.match(/"thread_id":"([\w-]+)"/)?.[1] ?? sesion;
  if (!fs.existsSync(salida)) throw new Error(`Codex no respondió (código ${r.status}). ${una(r.stderr, 200)}`);
  return { texto: fs.readFileSync(salida, 'utf8').trim(), sesion: id };
}

function resumir(proyecto, historial) {
  const esquema = JSON.stringify({ type: 'object', required: ['tema', 'vinetas'], properties: {
    tema: { type: 'string' }, vinetas: { type: 'array', items: { type: 'string' } }, leccion: { type: 'string' } } });
  const chat = historial.map((m) => `[${NOMBRE[m.quien]}] ${m.texto}`).join('\n\n');
  const orden = 'Resume este chat para la bitácora de una bóveda de conocimiento: «tema» (máx. 6 palabras) y de 2 a 5 «vinetas» '
    + 'con lo decidido, lo descubierto y lo pendiente (nada de charla). Procedencia: [U] dicho por Dano, [P] propuesta de una IA. '
    + '«leccion» solo si hay algo reutilizable en otros proyectos; si no, vacío. Español.\n\n';
  const r = spawnSync(BIN.claude, ['-p', '--output-format', 'json', '--json-schema', esquema, '--tools', '', '--strict-mcp-config', '--no-session-persistence'],
    { cwd: proyecto, input: orden + chat, encoding: 'utf8', env: entornoSeguro(), timeout: 5 * 60_000, windowsHide: true });
  const j = JSON.parse(r.stdout);
  return j.structured_output ?? JSON.parse(j.result);
}

function guardarEnBoveda(memoria, proyecto, historial) {
  const resumen = resumir(proyecto.ruta, historial);
  const entrada = entradaDiario(proyecto.nombre, resumen);
  if (!entrada) { console.error('El resumen salió vacío: no se escribe nada en la bóveda.'); return; }
  const dia = new Date().toISOString().slice(0, 10);
  const diario = path.join(memoria, 'Diario', `${dia}.md`);
  fs.mkdirSync(path.dirname(diario), { recursive: true });
  if (!fs.existsSync(diario)) fs.writeFileSync(diario, `---\ntipo: diario\nactualizado: ${dia}\n---\n# ${dia}\n`);
  fs.appendFileSync(diario, entrada);
  const git = (args) => spawnSync('git', args, { cwd: memoria, encoding: 'utf8', windowsHide: true });
  git(['add', path.relative(memoria, diario)]);
  git(['commit', '-m', `Diario: chat sobre ${proyecto.nombre}`]);
  if (git(['push', '-u', 'origin', 'HEAD']).status !== 0) console.warn('Aviso: resumen guardado en local; no se pudo subir la memoria.');
  console.error(`Resumen guardado en Diario/${dia}.md:${entrada}`);
  if (una(resumen.leccion, 500)) console.error(`Posible lección para Conocimiento/ (no se guarda sola): ${una(resumen.leccion, 500)}`);
}

async function main() {
  const ruta = path.resolve(process.argv[2] ?? process.cwd());
  const memoria = process.env.BOVEDA_DIR;
  const carpeta = path.join(path.resolve(process.env.TRABAJO_DIR ?? path.dirname(ruta)), 'chats');
  const proyecto = { ruta, nombre: path.basename(ruta) };
  fs.mkdirSync(carpeta, { recursive: true });
  for (const f of fs.readdirSync(carpeta)) { // limpieza: lo local es efímero
    const p = path.join(carpeta, f);
    if (Date.now() - fs.statSync(p).mtimeMs > DIAS_LOCAL * 864e5) fs.rmSync(p, { force: true });
  }
  const registro = path.join(carpeta, `${proyecto.nombre}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
  const historial = [];
  const estado = { claude: { vistos: 0, sesion: null }, codex: { vistos: 0, sesion: null } };
  const anotar = (quien, texto) => { historial.push({ quien, texto }); fs.appendFileSync(registro, `**${NOMBRE[quien]}:** ${texto}\n\n`); };

  console.error(`Chat con Claude y Codex sobre «${proyecto.nombre}». «@claude …» o «@codex …» para hablar con una; «/fin» para terminar.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  let turno = 0;
  rl.setPrompt('\nTú: ');
  rl.prompt();
  try {
    // Iterador y no rl.question: no pierde lo que se escribe mientras contesta una IA. Ctrl+D/Ctrl+Z también cierra.
    for await (const bruta of rl) {
      const linea = bruta.trim();
      if (linea === '/fin') break;
      if (!linea) { rl.prompt(); continue; }
      const { destino, texto } = destinatarios(linea, turno);
      if (!texto) { rl.prompt(); continue; }
      if (texto.length > MAX_MENSAJE) { console.error(`Mensaje demasiado largo (máx. ${MAX_MENSAJE} caracteres).`); rl.prompt(); continue; }
      if (destino.length > 1) turno++;
      anotar('dano', texto);
      for (const ia of destino) {
        const e = estado[ia];
        try {
          const entrada = pendientes(historial, e.vistos, ia, proyecto.nombre);
          const r = ia === 'claude' ? preguntarClaude(ruta, entrada, e.sesion) : preguntarCodex(ruta, entrada, e.sesion, carpeta);
          e.sesion = r.sesion;
          anotar(ia, r.texto || '(sin respuesta)');
          e.vistos = historial.length;
          console.log(`\n[${NOMBRE[ia]}] ${r.texto}`);
        } catch (err) { console.error(`\n[${NOMBRE[ia]}] ${err.message}`); }
      }
      rl.prompt();
    }
  } finally { rl.close(); }

  if (!historial.some((m) => m.quien !== 'dano')) return;
  console.error(`\nConversación completa (solo en este equipo, ${DIAS_LOCAL} días): ${registro}`);
  if (!memoria) { console.error('Sin BOVEDA_DIR: no se guarda resumen en la bóveda.'); return; }
  try { guardarEnBoveda(memoria, proyecto, historial); } catch (e) { console.warn(`Aviso: no se pudo resumir el chat (${e.message}).`); }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
