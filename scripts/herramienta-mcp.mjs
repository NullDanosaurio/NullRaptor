// Lanzador de una herramienta propia como servidor MCP (lo usa la configuración que hace scripts/ia.mjs):
//   node scripts/herramienta-mcp.mjs <id>
// Antes de cada arranque comprueba que sigue aprobada con la misma huella: si alguien cambió un archivo después de
// aprobarla (también a mitad de una sesión), no se ejecuta. La herramienta recibe solo PATH, HOME, idioma y las
// variables que declara en su ficha; habla MCP por la entrada y salida estándar, que pasan tal cual.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { herramientaLanzable } from './herramientas.mjs';

const id = process.argv[2] ?? '';
const trabajo = process.env.TRABAJO_DIR;
let h;
try {
  if (!trabajo) throw new Error('falta TRABAJO_DIR');
  h = herramientaLanzable({ trabajo: path.resolve(trabajo), env: process.env, id });
} catch (e) {
  console.error(`Herramienta no arrancada: ${e.message}.`);
  process.exit(1);
}

const propias = Object.fromEntries(h.mcp.variables.filter((v) => process.env[v.nombre]).map((v) => [v.nombre, process.env[v.nombre]]));
const comunes = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TZ'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
const hijo = spawn(process.execPath, [h.mcp.script, ...h.mcp.args], { cwd: h.carpeta, stdio: 'inherit', env: { ...comunes, ...propias } });
for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(senal, () => hijo.kill(senal));
hijo.on('error', (e) => { console.error(`Herramienta ${id}: ${e.message}`); process.exit(1); });
hijo.on('exit', (codigo, senal) => process.exit(codigo ?? (senal ? 1 : 0)));
