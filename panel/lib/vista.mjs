// Vista previa: el panel reenvía /vista/... al servidor de desarrollo de un proyecto (127.0.0.1:VISTA_PUERTO, 3000 por
// defecto), detrás de la misma entrada que el resto del panel (passkey por Tailscale, código en la red de casa).
// La web tiene que arrancar sabiendo que vive en /vista (en Next, basePath: '/vista').
// Las cookies del panel no se reenvían, y Host y Origin se reescriben a los del servidor de desarrollo para que lo
// trate como local (Next rechaza en desarrollo los recursos pedidos desde otro origen).
import http from 'node:http';
import net from 'node:net';

export const PREFIJO = '/vista';
const COOKIES_PANEL = ['nr_sesion', '__Host-nr_pk'];

/** ¿Es una ruta de la vista previa? */
export const esVista = (p) => p === PREFIJO || p.startsWith(`${PREFIJO}/`);

/** Ruta fija (p. ej. /catalogo/x.jpg o <a href="/carrito">) pedida desde una página de la vista previa: muchas webs no
 * ponen el basePath en todo. Devuelve la ruta con /vista delante, o null si no viene de la vista o es del panel. */
export function rutaDesdeVista(req, p) {
  if (esVista(p) || p.startsWith('/api/') || p.startsWith('/entrar')) return null;
  let origen;
  try { origen = new URL(req.headers.referer); } catch { return null; }
  return origen.host === req.headers.host && esVista(origen.pathname) ? PREFIJO + p : null;
}

/** ¿El navegador pide una página (y no una imagen o un script)? */
export const esPagina = (req) => (req.headers['sec-fetch-dest']
  ? req.headers['sec-fetch-dest'] === 'document'
  : String(req.headers.accept ?? '').includes('text/html'));

/** Quita las cookies del panel de una cabecera Cookie (null si no queda ninguna). */
export function limpiarCookies(cabecera) {
  const quedan = String(cabecera ?? '').split(/;\s*/).filter((c) => c && !COOKIES_PANEL.includes(c.split('=')[0]));
  return quedan.length ? quedan.join('; ') : null;
}

export function crearVista({ puerto = 3000, host = '127.0.0.1' } = {}) {
  const destino = `${host}:${puerto}`;
  function cabeceras(req) {
    const h = { ...req.headers, host: destino };
    const cookie = limpiarCookies(h.cookie);
    if (cookie) h.cookie = cookie; else delete h.cookie;
    if (h.origin) h.origin = `http://${destino}`;
    return h;
  }
  return {
    puerto,
    peticion(req, res) {
      const salida = http.request({ host, port: puerto, method: req.method, path: req.url, headers: cabeceras(req) }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      salida.on('error', () => {
        if (res.headersSent) { res.destroy(); return; }
        res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(`No hay ninguna web en marcha en el puerto ${puerto}. Arráncala con basePath ${PREFIJO}.`);
      });
      req.pipe(salida);
    },
    // WebSocket (recarga en caliente del servidor de desarrollo).
    mejora(req, socket, cabeza) {
      const salida = net.connect(puerto, host, () => {
        let texto = `${req.method} ${req.url} HTTP/1.1\r\n`;
        for (const [k, v] of Object.entries(cabeceras(req))) for (const x of [].concat(v)) texto += `${k}: ${x}\r\n`;
        salida.write(`${texto}\r\n`);
        if (cabeza?.length) salida.write(cabeza);
        salida.pipe(socket);
        socket.pipe(salida);
      });
      salida.on('error', () => socket.destroy());
      socket.on('error', () => salida.destroy());
    },
  };
}
