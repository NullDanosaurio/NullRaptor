// Entrada desde la app Android (app-movil/). Dentro de la app (WebView) la passkey no funciona: Android solo deja a una
// app usar las passkeys de un dominio si Google puede leer su assetlinks.json, y el panel solo existe en Tailscale.
// Así que se entra en Chrome y la sesión se pasa a la app con un código de un solo uso, al estilo PKCE:
//  1. La app genera un verificador secreto y abre en Chrome /vincular-app?reto=<sha256(verificador)>.
//  2. Chrome entra con la passkey (o ya tenía sesión confirmada hace menos de 1 h) y el panel emite un código ligado a
//     ese reto, que dura 2 minutos; la página devuelve el código a la app (es.nullraptor.movil://sesion?codigo=…).
//  3. La app canjea en su WebView /entrar/app?codigo=…&verificador=…: solo vale con el verificador que solo ella tiene,
//     así que otra app que capture el código no puede usarlo. Un intento por código.
import crypto from 'node:crypto';

export const CODIGO_APP_MS = 2 * 60_000;
export const ESQUEMA_APP = 'es.nullraptor.movil';
const B64U = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url
const MAX = 50;

export const retoDe = (verificador) => crypto.createHash('sha256').update(String(verificador)).digest('base64url');
export const retoValido = (reto) => typeof reto === 'string' && B64U.test(reto);
/** Petición hecha desde la app (la app añade «NullraptorApp» a su user agent). */
export const desdeApp = (req) => /\bNullraptorApp\//.test(String(req.headers['user-agent'] ?? ''));

export class CodigosApp {
  constructor({ ahora = Date.now } = {}) {
    this.ahora = ahora;
    this.codigos = new Map(); // código → { passkey, reto, expira }
  }

  /** Código de un solo uso para la passkey `passkey`, ligado al reto de la app. */
  emitir(passkey, reto) {
    if (!retoValido(reto)) throw Object.assign(new Error('Enlace de la app no válido: vuelve a entrar desde la app.'), { codigo: 400 });
    const t = this.ahora();
    for (const [c, d] of this.codigos) if (d.expira < t) this.codigos.delete(c);
    if (this.codigos.size >= MAX) throw Object.assign(new Error('Demasiados intentos a la vez: espera un poco.'), { codigo: 429 });
    const codigo = crypto.randomBytes(32).toString('base64url');
    this.codigos.set(codigo, { passkey, reto, expira: t + CODIGO_APP_MS });
    return codigo;
  }

  /** Canjea (una sola vez, acierte o no): devuelve la passkey o null. */
  canjear(codigo, verificador) {
    const d = typeof codigo === 'string' ? this.codigos.get(codigo) : null;
    if (!d) return null;
    this.codigos.delete(codigo);
    if (d.expira < this.ahora() || typeof verificador !== 'string' || !B64U.test(verificador)) return null;
    const a = Buffer.from(retoDe(verificador));
    const b = Buffer.from(d.reto);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? d.passkey : null;
  }
}

const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Página que devuelve el código a la app (en Chrome, tras entrar). El enlace necesita un toque: Chrome no abre
 * otra app sola desde una redirección. */
export function paginaVolverApp(codigo) {
  const enlace = `${ESQUEMA_APP}://sesion?codigo=${encodeURIComponent(codigo)}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nullraptor</title><style>
:root{color-scheme:light dark;--f:#f6f5f2;--t:#1c1b19;--a:#2f6f5e}@media (prefers-color-scheme:dark){:root{--f:#161614;--t:#eceae5;--a:#6fc2a8}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--f);color:var(--t);font:16px system-ui,sans-serif}
main{width:min(24rem,calc(100% - 32px));display:grid;gap:16px;text-align:center}h1{font-size:1.4rem;margin:0}p{margin:0;opacity:.75}
a{display:block;padding:14px;border-radius:8px;background:var(--a);color:#fff;text-decoration:none;font-weight:600}
</style></head><body><main><h1>Listo</h1><p>Ya has entrado. Vuelve a la app para seguir (el enlace caduca en 2 minutos).</p>
<a href="${escapar(enlace)}">Volver a la app de Nullraptor</a></main></body></html>`;
}

/** Página de error al canjear en la app. */
export function paginaCodigoMalo() {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nullraptor</title></head>
<body style="font:16px system-ui,sans-serif;padding:24px;background:#161614;color:#eceae5"><h1 style="font-size:1.3rem">No se pudo entrar</h1>
<p>El código caducó o ya se usó. <a style="color:#6fc2a8" href="${ESQUEMA_APP}://entrar">Vuelve a entrar con passkey</a>.</p></body></html>`;
}
