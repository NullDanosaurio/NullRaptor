// Rutas del centro de herramientas: ver las herramientas, revisar sus archivos, aprobarlas y desactivarlas.
// Aprobar da a una herramienta los permisos del contenedor, así que pide lo mismo que la terminal:
//  - desde este equipo (localhost), como el resto del panel;
//  - por Tailscale, la passkey confirmada en la última hora;
//  - por la red de casa con solo el código (PANEL_RED), no se puede.
// Se aprueba la huella que se revisó: si la herramienta cambia entretanto, la aprobación se rechaza (409).
// Desactivar siempre se puede: quita permisos, no los da.
import { aprobar, archivosDe, desactivar, listarHerramientas, verArchivo } from '../../scripts/herramientas.mjs';

const HUELLA = /^[0-9a-f]{64}$/;

/** Lo que ve la web: sin rutas absolutas del contenedor. */
const publica = ({ carpeta, mcp, ...h }) => ({ ...h, ...(mcp && { mcp: { args: mcp.args, variables: mcp.variables } }) });

export function crearRutasHerramientas({ trabajo, env = process.env, sesiones, registro = null, alCambiar = () => {}, leerCuerpo, json }) {
  const reautenticar = { error: 'Confirma con tu passkey para seguir.', reautenticar: true };
  // Un fallo al leer una ficha (lanzado por leerFicha) se cuenta como «no encontrada» o «no válida», no como error interno.
  const conMotivo = (fn) => {
    try { return [200, fn()]; } catch (e) {
      if (e.codigo) return [e.codigo, { error: e.message }];
      return e.code === 'ENOENT' ? [404, { error: 'Esa herramienta no existe.' }] : [400, { error: `No válida: ${e.message}.` }];
    }
  };

  /** ctx: { remota, sesion, soloCodigo, quien }. Devuelve true si atendió la petición. */
  return async function manejar(req, res, p, ctx) {
    if (p !== '/api/herramientas' && !p.startsWith('/api/herramientas/')) return false;
    const { remota, sesion, soloCodigo, quien } = ctx;
    const responder = ([codigo, datos]) => { json(res, codigo, datos); return true; };
    const q = new URL(req.url, 'http://localhost').searchParams;

    if (req.method === 'GET') {
      if (p === '/api/herramientas') return responder([200, { herramientas: listarHerramientas({ trabajo, env }).map(publica), aprobar: !soloCodigo }]);
      if (p === '/api/herramientas/archivos') return responder(conMotivo(() => archivosDe({ trabajo, env, id: q.get('id') ?? '' })));
      if (p === '/api/herramientas/archivo') return responder(conMotivo(() => verArchivo({ trabajo, env, id: q.get('id') ?? '', ruta: q.get('ruta') })));
      return responder([404, { error: 'No existe.' }]);
    }
    if (req.method !== 'POST') return responder([405, { error: 'Método no permitido.' }]);
    const { id, huella } = await leerCuerpo(req);
    if (typeof id !== 'string') return responder([400, { error: 'Falta la herramienta.' }]);

    if (p === '/api/herramientas/aprobar') {
      if (soloCodigo) return responder([403, { error: 'Las herramientas solo se aprueban desde este equipo o por Tailscale con passkey.' }]);
      if (remota && !sesiones.reautenticada(sesion)) return responder([403, reautenticar]);
      if (!HUELLA.test(huella ?? '')) return responder([400, { error: 'Falta la huella revisada.' }]);
      const r = conMotivo(() => aprobar({ trabajo, env, id, quien, esperada: huella }));
      if (r[0] !== 200) return responder(r);
      registro?.acceso({ evento: 'herramienta aprobada', id, huella, quien });
      if (remota) registro?.aviso(`Herramienta aprobada: ${id} (${quien})`);
      alCambiar();
      return responder(r);
    }
    if (p === '/api/herramientas/desactivar') {
      if (!desactivar({ env, id })) return responder([404, { error: 'Esa herramienta no estaba aprobada.' }]);
      registro?.acceso({ evento: 'herramienta desactivada', id, quien });
      alCambiar();
      return responder([200, { ok: true }]);
    }
    return responder([404, { error: 'No existe.' }]);
  };
}
