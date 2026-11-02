// Rutas para traer y crear proyectos (lib/proyectos.mjs). Escriben en el equipo, en la bóveda y, al crear, en
// GitHub con el token del cofre; por eso piden lo mismo que la terminal: desde este equipo, o por Tailscale con la
// passkey confirmada en la última hora. Con solo el código de la red de casa, no.
const ACCIONES = { '/api/proyectos/descargar': 'descargar', '/api/proyectos/clonar': 'clonar', '/api/proyectos/crear': 'crear' };

export function crearRutasProyectos({ proyectos, sesiones, registro = null, leerCuerpo, json }) {
  /** ctx: { remota, sesion, soloCodigo, quien }. Devuelve true si atendió la petición. */
  return async function manejar(req, res, p, ctx) {
    const accion = ACCIONES[p];
    if (!accion) return false;
    const responder = (codigo, datos) => { json(res, codigo, datos); return true; };
    if (req.method !== 'POST') return responder(405, { error: 'Método no permitido.' });
    if (ctx.soloCodigo) return responder(403, { error: 'Los proyectos se traen o crean desde este equipo o por Tailscale con passkey.' });
    if (ctx.remota && !sesiones.reautenticada(ctx.sesion)) return responder(403, { error: 'Confirma con tu passkey para seguir.', reautenticar: true });
    const { nombre, url } = await leerCuerpo(req);
    const r = accion === 'clonar' ? await proyectos.clonar(url, nombre) : await proyectos[accion](nombre);
    registro?.acceso({ evento: `proyecto: ${accion}`, nombre: r.nombre, ...(url && { url }), quien: ctx.quien });
    return responder(201, r);
  };
}
