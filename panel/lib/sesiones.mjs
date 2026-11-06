// Última actividad de las sesiones de Claude Code, guardada fuera de los proyectos.
import fs from 'node:fs';
import path from 'node:path';

export const MINUTOS_PARADA = 10;

/** Lee los latidos válidos; una sesión terminada nunca cuenta como parada. */
export function leerSesiones(trabajo, { ahora = new Date(), minutos = MINUTOS_PARADA } = {}) {
  const sesiones = {};
  try {
    const dir = path.join(trabajo, '.sesiones');
    for (const nombre of fs.readdirSync(dir)) {
      if (!nombre.endsWith('.json')) continue;
      try {
        const datos = JSON.parse(fs.readFileSync(path.join(dir, nombre), 'utf8'));
        if (!datos || typeof datos.proyecto !== 'string' || !datos.proyecto ||
            nombre !== `${datos.proyecto}.json` || typeof datos.evento !== 'string' ||
            typeof datos.en !== 'string') continue;
        const hace = (ahora.getTime() - Date.parse(datos.en)) / 1000;
        if (!Number.isFinite(hace)) continue;
        const terminada = datos.evento === 'SessionEnd';
        Object.defineProperty(sesiones, datos.proyecto, {
          value: { evento: datos.evento, en: datos.en, hace, parada: hace > minutos * 60 && !terminada, terminada },
          enumerable: true, configurable: true, writable: true,
        });
      } catch { /* Un archivo roto no oculta las demás sesiones. */ }
    }
  } catch { /* Sin carpeta de sesiones no hay actividad registrada. */ }
  return sesiones;
}
