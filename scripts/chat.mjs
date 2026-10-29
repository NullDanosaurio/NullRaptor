// Chat de grupo: Dano, Claude y Codex sobre un proyecto, en la terminal (y en el panel web, con la clase Chat).
//   node scripts/chat.mjs <carpeta del proyecto>     (preparar.mjs lo lanza con BOVEDA_DIR y TRABAJO_DIR)
// Sin destinatario contestan las dos, alternando quién empieza; «@claude …» o «@codex …» habla con una; «/fin» cierra.
// Las dos solo leen el proyecto (nunca dos escritores a la vez). La conversación completa queda en el equipo
// ($TRABAJO_DIR/chats, se borra a los 30 días); a la bóveda solo va el resumen, en el Diario.
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { BIN, entornoSeguro } from '../flujo/lib/comun.mjs';

export const IAS = ['claude', 'codex'];
export const NOMBRE = { dano: 'Dano', claude: 'Claude', codex: 'Codex' };
export const DIAS_LOCAL = 30;
export const MAX_MENSAJE = 20_000;
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

/** Proceso hijo asíncrono (no bloquea el panel web mientras contesta una IA). */
function correr(cmd, args, { cwd, input, timeout }) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let hecho = false;
    const hijo = spawn(cmd, args, { cwd, env: entornoSeguro(), windowsHide: true });
    const fin = (status) => {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      resolve({ status, stdout, stderr });
    };
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), timeout);
    hijo.stdout.on('data', (d) => { stdout += d; });
    hijo.stderr.on('data', (d) => { stderr += d; });
    hijo.on('error', (e) => { stderr += e.message; fin(null); });
    hijo.on('close', (code) => fin(code));
    hijo.stdin.on('error', () => {});
    hijo.stdin.end(input);
  });
}

async function preguntarClaude(proyecto, entrada, sesion) {
  const args = ['-p', '--output-format', 'json', '--tools', 'Read,Grep,Glob', '--permission-mode', 'dontAsk', '--strict-mcp-config'];
  if (sesion) args.push('--resume', sesion);
  const r = await correr(BIN.claude, args, { cwd: proyecto, input: entrada, timeout: 10 * 60_000 });
  try {
    const j = JSON.parse(r.stdout);
    if (j.is_error) throw new Error(j.result);
    return { texto: String(j.result ?? '').trim(), sesion: j.session_id ?? sesion };
  } catch (e) { throw new Error(`Claude no respondió (${e.message ?? r.status}). ${una(r.stderr, 200)}`); }
}

async function preguntarCodex(proyecto, entrada, sesion, salida) {
  fs.rmSync(salida, { force: true });
  // resume no admite --sandbox: el modo va por configuración, también en la primera llamada.
  const comunes = ['-c', 'sandbox_mode="read-only"', '--skip-git-repo-check', '--json', '-o', salida];
  const args = sesion ? ['exec', 'resume', ...comunes, sesion, '-'] : ['exec', ...comunes, '--color', 'never', '-'];
  const r = await correr(BIN.codex, args, { cwd: proyecto, input: entrada, timeout: 10 * 60_000 });
  const id = r.stdout?.match(/"thread_id":"([\w-]+)"/)?.[1] ?? sesion;
  if (!fs.existsSync(salida)) throw new Error(`Codex no respondió (código ${r.status}). ${una(r.stderr, 200)}`);
  return { texto: fs.readFileSync(salida, 'utf8').trim(), sesion: id };
}

async function resumir(proyecto, historial) {
  const esquema = JSON.stringify({ type: 'object', required: ['tema', 'vinetas'], properties: {
    tema: { type: 'string' }, vinetas: { type: 'array', items: { type: 'string' } }, leccion: { type: 'string' } } });
  const chat = historial.map((m) => `[${NOMBRE[m.quien]}] ${m.texto}`).join('\n\n');
  const orden = 'Resume este chat para la bitácora de una bóveda de conocimiento: «tema» (máx. 6 palabras) y de 2 a 5 «vinetas» '
    + 'con lo decidido, lo descubierto y lo pendiente (nada de charla). Procedencia: [U] dicho por Dano, [P] propuesta de una IA. '
    + '«leccion» solo si hay algo reutilizable en otros proyectos; si no, vacío. Español.\n\n';
  const r = await correr(BIN.claude, ['-p', '--output-format', 'json', '--json-schema', esquema, '--tools', '', '--strict-mcp-config', '--no-session-persistence'],
    { cwd: proyecto, input: orden + chat, timeout: 5 * 60_000 });
  const j = JSON.parse(r.stdout);
  return j.structured_output ?? JSON.parse(j.result);
}

/** Escribe el resumen en Diario/AAAA-MM-DD.md de la bóveda, hace commit y lo sube (rama del agente). */
async function guardarEnBoveda(memoria, proyecto, historial) {
  const resumen = await resumir(proyecto.ruta, historial);
  const entrada = entradaDiario(proyecto.nombre, resumen);
  if (!entrada) return { avisos: ['El resumen salió vacío: no se escribe nada en la bóveda.'] };
  const dia = new Date().toISOString().slice(0, 10);
  const diario = path.join(memoria, 'Diario', `${dia}.md`);
  fs.mkdirSync(path.dirname(diario), { recursive: true });
  if (!fs.existsSync(diario)) fs.writeFileSync(diario, `---\ntipo: diario\nactualizado: ${dia}\n---\n# ${dia}\n`);
  fs.appendFileSync(diario, entrada);
  const git = (args) => spawnSync('git', args, { cwd: memoria, encoding: 'utf8', windowsHide: true });
  git(['add', path.relative(memoria, diario)]);
  git(['commit', '-m', `Diario: chat sobre ${proyecto.nombre}`]);
  const avisos = [];
  if (git(['push', '-u', 'origin', 'HEAD']).status !== 0) avisos.push('Resumen guardado en local; no se pudo subir la memoria.');
  return { nota: `Diario/${dia}.md`, entrada, leccion: una(resumen.leccion, 500) || null, avisos };
}

/** Borra los chats locales de más de DIAS_LOCAL días: lo local es efímero. */
export function limpiarChats(carpeta) {
  fs.mkdirSync(carpeta, { recursive: true });
  for (const f of fs.readdirSync(carpeta)) {
    const p = path.join(carpeta, f);
    if (Date.now() - fs.statSync(p).mtimeMs > DIAS_LOCAL * 864e5) fs.rmSync(p, { force: true });
  }
}

/**
 * Una conversación. Eventos: 'mensaje' {quien, texto, hora} · 'escribiendo' ia|null · 'fallo' {quien, texto}.
 * Solo un mensaje a la vez (las IA contestan por turnos).
 */
export class Chat extends EventEmitter {
  constructor({ ruta, carpeta }) {
    super();
    this.proyecto = { ruta, nombre: path.basename(ruta) };
    this.carpeta = carpeta;
    limpiarChats(carpeta);
    this.registro = path.join(carpeta, `${this.proyecto.nombre}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`);
    this.historial = [];
    this.estado = { claude: { vistos: 0, sesion: null }, codex: { vistos: 0, sesion: null } };
    this.turno = 0;
    this.ocupado = false;
    this.escribiendo = null;
  }

  anotar(quien, texto) {
    const m = { quien, texto, hora: new Date().toISOString() };
    this.historial.push(m);
    fs.appendFileSync(this.registro, `**${NOMBRE[quien]}:** ${texto}\n\n`);
    this.emit('mensaje', m);
  }

  /** Envía una línea de Dano y espera las respuestas. Devuelve false si no había nada que enviar. */
  async enviar(linea) {
    if (this.ocupado) throw new Error('Espera a que terminen de contestar.');
    const { destino, texto } = destinatarios(String(linea ?? '').trim(), this.turno);
    if (!texto) return false;
    if (texto.length > MAX_MENSAJE) throw new Error(`Mensaje demasiado largo (máx. ${MAX_MENSAJE} caracteres).`);
    this.ocupado = true;
    try {
      if (destino.length > 1) this.turno++;
      this.anotar('dano', texto);
      for (const ia of destino) {
        const e = this.estado[ia];
        this.escribiendo = ia;
        this.emit('escribiendo', ia);
        try {
          const entrada = pendientes(this.historial, e.vistos, ia, this.proyecto.nombre);
          const r = ia === 'claude'
            ? await preguntarClaude(this.proyecto.ruta, entrada, e.sesion)
            : await preguntarCodex(this.proyecto.ruta, entrada, e.sesion, path.join(this.carpeta, `.codex-${path.basename(this.registro, '.md')}.txt`));
          e.sesion = r.sesion;
          this.anotar(ia, r.texto || '(sin respuesta)');
          e.vistos = this.historial.length;
        } catch (err) { this.emit('fallo', { quien: ia, texto: err.message }); }
      }
      return true;
    } finally {
      this.ocupado = false;
      this.escribiendo = null;
      this.emit('escribiendo', null);
    }
  }

  /** Cierra: si hubo respuestas y hay bóveda, resume en el Diario. */
  async cerrar(memoria) {
    if (!this.historial.some((m) => m.quien !== 'dano')) return { registro: null, avisos: [] };
    const base = { registro: this.registro };
    if (!memoria) return { ...base, avisos: ['Sin BOVEDA_DIR: no se guarda resumen en la bóveda.'] };
    try { return { ...base, ...(await guardarEnBoveda(memoria, this.proyecto, this.historial)) }; } catch (e) {
      return { ...base, avisos: [`No se pudo resumir el chat (${e.message}).`] };
    }
  }
}

async function main() {
  const ruta = path.resolve(process.argv[2] ?? process.cwd());
  const carpeta = path.join(path.resolve(process.env.TRABAJO_DIR ?? path.dirname(ruta)), 'chats');
  const chat = new Chat({ ruta, carpeta });
  chat.on('mensaje', (m) => { if (m.quien !== 'dano') console.log(`\n[${NOMBRE[m.quien]}] ${m.texto}`); });
  chat.on('fallo', (f) => console.error(`\n[${NOMBRE[f.quien]}] ${f.texto}`));

  console.error(`Chat con Claude y Codex sobre «${chat.proyecto.nombre}». «@claude …» o «@codex …» para hablar con una; «/fin» para terminar.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  rl.setPrompt('\nTú: ');
  rl.prompt();
  try {
    // Iterador y no rl.question: no pierde lo que se escribe mientras contesta una IA. Ctrl+D/Ctrl+Z también cierra.
    for await (const bruta of rl) {
      const linea = bruta.trim();
      if (linea === '/fin') break;
      try { await chat.enviar(linea); } catch (e) { console.error(e.message); }
      rl.prompt();
    }
  } finally { rl.close(); }

  const r = await chat.cerrar(process.env.BOVEDA_DIR);
  if (r.registro) console.error(`\nConversación completa (solo en este equipo, ${DIAS_LOCAL} días): ${r.registro}`);
  for (const a of r.avisos ?? []) console.warn(`Aviso: ${a}`);
  if (r.entrada) console.error(`Resumen guardado en ${r.nota}:${r.entrada}`);
  if (r.leccion) console.error(`Posible lección para Conocimiento/ (no se guarda sola): ${r.leccion}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
