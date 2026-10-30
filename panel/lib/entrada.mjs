// Entrada al panel por Tailscale (PANEL_DOMINIO): todo lo que llega por ese dominio exige passkey. Página /entrar,
// su script y las rutas de entrada y alta. Lo que llega por localhost sigue como siempre (este equipo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'entrar.js');
const MAX_FALLOS = 10; // por minuto, en total

const sinPuerto = (host) => String(host ?? '').toLowerCase().replace(/:\d{1,5}$/, '');

/** El dominio de Tailscale como Host (con o sin puerto). */
export const hostDominio = (host, dominio) => Boolean(dominio) && sinPuerto(host) === dominio.toLowerCase();

/** Petición que viene de fuera de este equipo: por el dominio o a través de un proxy (Tailscale añade estas
 * cabeceras; un navegador local nunca las manda). Ante la duda, remota: se le pide passkey. */
export function esRemota(req, dominio) {
  if (!dominio) return false;
  const h = req.headers;
  return hostDominio(h.host, dominio) || Boolean(h['x-forwarded-host'] || h['x-forwarded-for'] || h['tailscale-user-login']);
}

/** Quién es, para el registro: usuario de Tailscale si lo da, y la IP de origen. */
export function quienEs(req, sesion) {
  const limpio = (s) => String(s ?? '').replace(/[^\w@.:+-]/g, '').slice(0, 100);
  const tailscale = limpio(req.headers['tailscale-user-login']);
  return [tailscale || null, sesion?.passkey ? `passkey ${sesion.passkey.nombre}` : null, limpio(String(req.headers['x-forwarded-for'] ?? '').split(',')[0]) || null]
    .filter(Boolean).join(' · ') || 'este equipo';
}

export function paginaPasskey({ hay }) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nullraptor</title><style>
:root{color-scheme:light dark;--f:#f6f5f2;--t:#1c1b19;--b:#d8d5ce;--a:#2f6f5e}
@media (prefers-color-scheme:dark){:root{--f:#161614;--t:#eceae5;--b:#3a3935;--a:#6fc2a8}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--f);color:var(--t);font:16px system-ui,sans-serif}
main{width:min(24rem,calc(100% - 32px));display:grid;gap:20px}h1{font-size:1.4rem;margin:0}p{margin:0;opacity:.75}form{display:grid;gap:10px}
input{font:inherit;padding:12px;border:1px solid var(--b);border-radius:8px;background:transparent;color:inherit}
button{font:inherit;padding:12px;border:0;border-radius:8px;background:var(--a);color:#fff;cursor:pointer}
.s{background:transparent;color:inherit;border:1px solid var(--b)}.e{color:#c2410c;opacity:1}hr{border:0;border-top:1px solid var(--b);width:100%}
</style></head><body><main><h1>Nullraptor</h1>
${hay ? '<button id="entrar">Entrar con passkey</button><hr>' : '<p>Primera vez: escribe el código que muestra el lanzador en el equipo de Nullraptor y crea tu passkey.</p>'}
<form id="alta">${hay ? '<p>¿Dispositivo nuevo? Saca un código de alta desde el panel en uno que ya tenga passkey.</p>' : ''}
<input id="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${hay ? 'Código de alta' : 'Código del lanzador'}" required>
<input id="nombre" autocomplete="off" maxlength="40" placeholder="Nombre de este dispositivo (p. ej. iPhone)">
<button class="${hay ? 's' : ''}">Crear passkey en este dispositivo</button></form>
<p id="aviso" role="status"></p></main><script src="/entrar.js"></script></body></html>`;
}

/**
 * Rutas de /entrar en modo Tailscale. `codigoLanzador(intento)` → 'ok' | 'mal' | 'bloqueado' (crearAcceso().probar).
 * Devuelve true si atendió la petición.
 */
export function crearEntrada({ passkeys, sesiones, codigoLanzador, registro, leerCuerpo, json, html, ahora = Date.now }) {
  let fallos = [];
  const bloqueado = () => { fallos = fallos.filter((t) => ahora() - t < 60_000); return fallos.length >= MAX_FALLOS; };
  const fallar = (req, motivo) => { fallos.push(ahora()); registro?.acceso({ evento: 'fallo', motivo, quien: quienEs(req) }); };
  const entrarCon = (req, res, passkey, evento) => {
    const token = sesiones.crear(passkey);
    const quien = quienEs(req, { passkey });
    registro?.acceso({ evento, quien });
    registro?.aviso(`${evento === 'alta' ? 'Passkey nueva' : 'Entrada'} en el panel: ${quien}`);
    json(res, 200, { ok: true }, { 'Set-Cookie': sesiones.cookie(token) });
  };

  return async function manejar(req, res, p) {
    if (p === '/entrar.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(fs.readFileSync(SCRIPT));
      return true;
    }
    if (p === '/entrar' && req.method === 'GET') { html(res, 200, paginaPasskey({ hay: passkeys.hay() })); return true; }
    if (!p.startsWith('/entrar/')) return false;
    if (req.method !== 'POST') { json(res, 405, { error: 'Método no permitido.' }); return true; }
    if (bloqueado()) { json(res, 429, { error: 'Demasiados intentos: espera un minuto.' }); return true; }
    const cuerpo = await leerCuerpo(req);
    try {
      if (p === '/entrar/opciones') {
        if (!passkeys.hay()) { json(res, 409, { error: 'Aún no hay passkeys: da de alta la primera.' }); return true; }
        json(res, 200, passkeys.opcionesEntrada('entrada'));
      } else if (p === '/entrar/passkey') {
        entrarCon(req, res, passkeys.verificar(cuerpo, 'entrada'), 'entrada');
      } else if (p === '/entrar/alta/opciones') {
        // Primera passkey: con el código del lanzador. Las siguientes: solo con un código de alta de un solo uso.
        const ok = passkeys.hay() ? passkeys.usarCodigoAlta(cuerpo.codigo) : codigoLanzador(cuerpo.codigo) === 'ok';
        if (!ok) { fallar(req, 'código de alta'); json(res, 401, { error: 'Código incorrecto o caducado.' }); return true; }
        json(res, 200, passkeys.opcionesAlta());
      } else if (p === '/entrar/alta') {
        entrarCon(req, res, passkeys.registrar(cuerpo.respuesta, cuerpo.nombre), 'alta');
      } else {
        json(res, 404, { error: 'No existe.' });
      }
    } catch (e) {
      if (!e.codigo) throw e;
      if (e.codigo === 401 || e.codigo === 403) fallar(req, e.message);
      json(res, e.codigo, { error: e.message });
    }
    return true;
  };
}
