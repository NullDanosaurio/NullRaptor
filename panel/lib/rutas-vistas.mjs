// Ruta de las vistas (lib/vistas.mjs): GET lee (o migra desde el diseño), PUT valida y guarda.
export function crearRutasVistas({ vistas, leerCuerpo, json }) {
  /** Devuelve true si atendió la petición. */
  return async function manejar(req, res, p) {
    if (p !== '/api/vistas') return false;
    if (req.method === 'GET') { json(res, 200, vistas.leer()); return true; }
    if (req.method !== 'PUT') { json(res, 405, { error: 'Método no permitido.' }); return true; }
    const r = vistas.guardar(await leerCuerpo(req));
    if (r.error) { json(res, 400, { error: r.error }); return true; }
    json(res, 200, r.datos);
    return true;
  };
}
