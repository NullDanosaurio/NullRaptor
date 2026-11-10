// Ruta del diseño del Resumen (lib/diseno.mjs): GET lee el orden de los widgets, PUT lo guarda.
import { IDS } from './diseno.mjs';

const valido = (orden) => Array.isArray(orden) && orden.length <= IDS.length
  && orden.every((id) => typeof id === 'string' && IDS.includes(id)) && new Set(orden).size === orden.length;

export function crearRutasDiseno({ diseno, leerCuerpo, json }) {
  /** Devuelve true si atendió la petición. */
  return async function manejar(req, res, p) {
    if (p !== '/api/diseno') return false;
    if (req.method === 'GET') { json(res, 200, diseno.leer()); return true; }
    if (req.method !== 'PUT') { json(res, 405, { error: 'Método no permitido.' }); return true; }
    const { orden } = await leerCuerpo(req);
    if (!valido(orden)) { json(res, 400, { error: 'El orden no es válido.' }); return true; }
    json(res, 200, { orden: diseno.guardar(orden) });
    return true;
  };
}
