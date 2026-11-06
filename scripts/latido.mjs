// Latido de Claude Code: guarda la última actividad fuera de los proyectos, sin interrumpir la sesión.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { proyectoDe } from './relevo.mjs';

/** Anota el último evento de un proyecto. Un error del hook nunca debe afectar a Claude. */
export function registrarLatido(entrada, trabajo, ahora = new Date()) {
  let temporal;
  try {
    const proyecto = proyectoDe(entrada?.cwd, trabajo);
    if (!proyecto) return;
    const datos = {
      proyecto, evento: entrada.hook_event_name ?? null,
      sesion: entrada.session_id ?? null, en: ahora.toISOString(),
    };
    const dir = path.join(trabajo, '.sesiones');
    fs.mkdirSync(dir, { recursive: true });
    const ruta = path.join(dir, `${proyecto}.json`);
    temporal = `${ruta}.${process.pid}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporal, `${JSON.stringify(datos)}\n`);
    fs.renameSync(temporal, ruta);
  } catch { /* El latido es opcional y nunca imprime ni propaga errores. */ }
  finally {
    try { if (temporal) fs.rmSync(temporal, { force: true }); } catch { /* Limpieza opcional. */ }
  }
}

try {
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
      const entrada = JSON.parse(fs.readFileSync(0, 'utf8'));
      registrarLatido(entrada, process.env.TRABAJO_DIR);
    } catch { /* También se tolera una entrada vacía o rota. */ }
    process.exitCode = 0;
  }
} catch { /* Importar el módulo tampoco debe fallar por la detección del ejecutable. */ }
