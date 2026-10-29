// Acceso al panel desde la red de casa (PANEL_RED=1). Cada navegador entra una vez con el código de acceso y queda
// con una cookie de sesión (HttpOnly, SameSite=Strict, 30 días). Sin modo red no hay código: solo localhost.
// El código vive en el volumen; borrarlo (o cambiarlo) cierra todas las sesiones.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I: se teclea bien en el móvil
const COOKIE = 'nr_sesion';
const MAX_FALLOS = 10; // por minuto, en total: frena a quien pruebe códigos desde la red
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

/** Código nuevo de `n` caracteres (12 → 60 bits), en grupos de 4 para leerlo mejor: ABCD-EFGH-JKLM. */
export function codigoNuevo(n = 12) {
  const c = [...crypto.randomBytes(n)].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return c.match(/.{1,4}/g).join('-');
}

const normalizar = (c) => String(c ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function leerOCrearCodigo(archivo) {
  try { const c = fs.readFileSync(archivo, 'utf8').trim(); if (normalizar(c).length >= 12) return c; } catch { /* se crea */ }
  const c = codigoNuevo();
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, `${c}\n`, { mode: 0o600 });
  return c;
}

const igual = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

/** Host de la red de casa: localhost, IPv4 privada o nombre del equipo (sin punto, o .local/.lan/.home.arpa). */
export function hostRed(host) {
  const m = /^(\[::1\]|[^:]+)(:\d{1,5})?$/.exec(String(host ?? ''));
  if (!m) return false;
  const h = m[1].toLowerCase();
  if (LOCAL.test(h)) return true;
  const ip = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (ip.slice(1).some((x) => Number(x) > 255)) return false;
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return /^[a-z0-9]([a-z0-9-]{0,62})(\.(local|lan|home\.arpa))?$/.test(h);
}

export function crearAcceso(codigo, { ahora = Date.now } = {}) {
  const sesion = crypto.createHmac('sha256', normalizar(codigo)).update('nullraptor-panel-sesion').digest('base64url');
  let fallos = [];
  return {
    cookie: `${COOKIE}=${sesion}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
    autenticado(req) {
      const valor = String(req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
      return Boolean(valor) && igual(valor, sesion);
    },
    /** 'ok' | 'mal' | 'bloqueado' */
    probar(intento) {
      fallos = fallos.filter((t) => ahora() - t < 60_000);
      if (fallos.length >= MAX_FALLOS) return 'bloqueado';
      if (normalizar(intento) && igual(normalizar(intento), normalizar(codigo))) return 'ok';
      fallos.push(ahora());
      return 'mal';
    },
  };
}

const escapar = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Página de entrada: un formulario sin JavaScript. */
export function paginaEntrar(error = '') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nullraptor</title><style>
:root{color-scheme:light dark;--f:#f6f5f2;--t:#1c1b19;--b:#d8d5ce;--a:#2f6f5e}
@media (prefers-color-scheme:dark){:root{--f:#161614;--t:#eceae5;--b:#3a3935;--a:#6fc2a8}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--f);color:var(--t);font:16px system-ui,sans-serif}
form{width:min(22rem,calc(100% - 32px));display:grid;gap:12px}h1{font-size:1.4rem;margin:0}p{margin:0;opacity:.75}
input{font:inherit;font-size:1.2rem;letter-spacing:.12em;text-transform:uppercase;padding:12px;border:1px solid var(--b);border-radius:8px;background:transparent;color:inherit}
button{font:inherit;padding:12px;border:0;border-radius:8px;background:var(--a);color:#fff;cursor:pointer}.e{color:#c2410c;opacity:1}
</style></head><body><form method="post" action="/entrar"><h1>Nullraptor</h1>
<p>Escribe el código de acceso que muestra el lanzador en el equipo de Nullraptor.</p>
${error ? `<p class="e">${escapar(error)}</p>` : ''}
<input name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKLM" required autofocus>
<button>Entrar</button></form></body></html>`;
}
