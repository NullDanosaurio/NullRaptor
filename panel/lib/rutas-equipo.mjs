// Rutas de los ajustes del equipo (lib/equipo.mjs): acceso y carpetas de Windows. Cambiarlos amplía lo que se ve del
// PC y desde dónde se entra, así que pide lo mismo que aprobar herramientas (decisión de Daniel, 02/11/2026): desde
// este equipo, o por Tailscale con la passkey confirmada en la última hora; con solo el código de casa, no.
// Cada pedido queda en el registro de accesos y avisa al móvil (ntfy, si está).
export function crearRutasEquipo({ equipo, sesiones, registro = null, leerCuerpo, json }) {
  /** ctx: { remota, sesion, soloCodigo, quien }. Devuelve true si atendió la petición. */
  return async function manejar(req, res, p, ctx) {
    if (p !== '/api/equipo' && p !== '/api/equipo/cancelar') return false;
    const responder = (codigo, datos) => { json(res, codigo, datos); return true; };
    if (req.method === 'GET' && p === '/api/equipo') return responder(200, { ...equipo.estado(), cambiar: !ctx.soloCodigo });
    if (req.method !== 'POST') return responder(405, { error: 'Método no permitido.' });
    if (ctx.soloCodigo) return responder(403, { error: 'El acceso y las carpetas se cambian desde este equipo o por Tailscale con passkey.' });
    if (ctx.remota && !sesiones.reautenticada(ctx.sesion)) return responder(403, { error: 'Confirma con tu passkey para seguir.', reautenticar: true });
    if (p === '/api/equipo/cancelar') {
      const ok = equipo.cancelar();
      if (ok) registro?.acceso({ evento: 'ajustes del equipo: pedido retirado', quien: ctx.quien });
      return responder(200, { ok });
    }
    const pedido = equipo.pedir(await leerCuerpo(req), ctx.quien);
    if (pedido) {
      registro?.acceso({ evento: 'ajustes del equipo: pedido', red: pedido.red, tailscale: pedido.tailscale, carpetas: pedido.carpetas, ahora: pedido.ahora, quien: ctx.quien });
      registro?.aviso(`Ajustes del equipo pedidos (${ctx.quien}): red ${pedido.red ? 'sí' : 'no'}, Tailscale ${pedido.tailscale ? 'sí' : 'no'}, ${pedido.carpetas.length} carpeta(s)`);
    }
    return responder(200, { pedido });
  };
}
