// Entrada de desarrollo en terminal: node /nullraptor/scripts/codex.mjs <proyecto> [resume <id> ...].
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prepararSesionCodex } from './codex-sesion.mjs';
import { argsDesarrolloCodex } from './sesiones-codex.mjs';
import { binarioCodex } from './relevo.mjs';

export function abrirCodex(ruta, { env = process.env, adicionales = [], arrancar = spawn } = {}) {
  const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const trabajo = env.TRABAJO_DIR;
  if (!trabajo) throw new Error('Falta TRABAJO_DIR. Abre Codex desde Nullraptor.');
  const limpia = { ...env };
  delete limpia.AGENTE_CLAVE;
  const preparada = prepararSesionCodex({ agente, trabajo, memoria: limpia.BOVEDA_DIR, env: limpia });
  const adjuntos = path.join(trabajo, 'adjuntos');
  fs.mkdirSync(adjuntos, { recursive: true });
  const args = argsDesarrolloCodex({ ruta: path.resolve(ruta), adjuntos, memoria: limpia.BOVEDA_DIR, env: limpia, trabajo, configDir: limpia.CLAUDE_CONFIG_DIR, configuracion: preparada.args });
  const hijo = arrancar(binarioCodex(agente, limpia), [...args, ...adicionales], { cwd: path.resolve(ruta), stdio: 'inherit', env: limpia });
  const reenviar = (senal) => hijo.kill(senal);
  for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(senal, reenviar);
  return new Promise((resolver, rechazar) => {
    const limpiar = () => { for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(senal, reenviar); };
    hijo.on('error', (e) => { limpiar(); rechazar(e); });
    hijo.on('exit', (codigo) => { limpiar(); resolver(codigo ?? 1); });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try { process.exitCode = await abrirCodex(process.argv[2] ?? process.cwd(), { adicionales: process.argv.slice(3) }); }
  catch (e) { console.error(`Codex: ${e.message}`); process.exitCode = 1; }
}
