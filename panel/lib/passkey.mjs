// Passkeys (WebAuthn) y sesiones del panel cuando se entra por Tailscale (PANEL_DOMINIO, p. ej. pc.tailnet.ts.net).
// Sin dependencias: el navegador entrega la clave pública en SPKI (getPublicKey) y aquí se comprueban reto, origen,
// dominio (rpIdHash), presencia y verificación del usuario (huella, cara o PIN), contador y firma con node:crypto.
// Alta: la primera passkey con el código del lanzador; las siguientes con un código de un solo uso que se saca desde
// una sesión ya abierta. Recuperación: borrar el archivo de passkeys del volumen y volver a dar de alta con el código.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const RETO_MS = 2 * 60_000;
const ALTA_MS = 10 * 60_000;
const ALGORITMOS = { '-7': 'sha256', '-257': 'sha256', '-8': null }; // ES256, RS256, EdDSA
const UP = 0x01; // usuario presente
const UV = 0x04; // usuario verificado
const AT = 0x40; // trae credencial (alta)
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const fallo = (mensaje, codigo = 400) => Object.assign(new Error(mensaje), { codigo });
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (d) => crypto.createHash('sha256').update(d).digest();
const ahoraIso = (t) => new Date(t).toISOString();

/** base64url de la petición a Buffer; rechaza lo que no lo sea o sea enorme. */
export function deB64u(s, max = 16_384) {
  if (typeof s !== 'string' || !s || s.length > max || !/^[A-Za-z0-9_-]+$/.test(s)) throw fallo('Respuesta de la passkey no válida.');
  return Buffer.from(s, 'base64url');
}

const limpiarNombre = (n) => String(n ?? '').replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 40) || 'Passkey';

export class Passkeys {
  constructor({ archivo, dominio, ahora = Date.now }) {
    this.archivo = archivo;
    this.dominio = dominio;
    this.ahora = ahora;
    this.retos = new Map(); // reto → { tipo, expira, usuario? }
    this.altas = new Map(); // código de alta → expira
  }

  get origen() { return `https://${this.dominio}`; }

  leer() {
    try {
      const d = JSON.parse(fs.readFileSync(this.archivo, 'utf8'));
      return { usuario: d.usuario ?? null, claves: Array.isArray(d.claves) ? d.claves : [] };
    } catch (e) {
      if (e.code === 'ENOENT') return { usuario: null, claves: [] };
      throw e;
    }
  }

  guardar(d) {
    fs.mkdirSync(path.dirname(this.archivo), { recursive: true });
    const temporal = `${this.archivo}.${process.pid}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(d, null, 2), { mode: 0o600 });
    fs.renameSync(temporal, this.archivo);
  }

  hay() { return this.leer().claves.length > 0; }

  lista() { return this.leer().claves.map(({ id, nombre, creada, usada }) => ({ id, nombre, creada, usada })); }

  reto(tipo, extra = {}) {
    const t = this.ahora();
    for (const [c, r] of this.retos) if (r.expira < t) this.retos.delete(c);
    if (this.retos.size > 200) throw fallo('Demasiados intentos a la vez: espera un poco.', 429);
    const c = b64u(crypto.randomBytes(32));
    this.retos.set(c, { tipo, expira: t + RETO_MS, ...extra });
    return c;
  }

  /** Comprueba clientDataJSON y consume su reto (un solo uso). */
  tomarReto(clientData, reto, tipo) {
    let cd;
    try { cd = JSON.parse(clientData.toString('utf8')); } catch { throw fallo('Respuesta de la passkey no válida.'); }
    const r = typeof cd.challenge === 'string' ? this.retos.get(cd.challenge) : null;
    if (!r || r.expira < this.ahora() || r.tipo !== reto) throw fallo('El reto ha caducado o no es válido: vuelve a intentarlo.', 401);
    this.retos.delete(cd.challenge);
    if (cd.type !== tipo) throw fallo('Respuesta de la passkey no válida.', 401);
    if (cd.origin !== this.origen || cd.crossOrigin === true) throw fallo('Origen no permitido.', 403);
    return r;
  }

  /** authenticatorData: dominio, usuario presente y verificado. Devuelve el contador. */
  comprobarDatos(datos, alta) {
    if (datos.length < 37) throw fallo('Respuesta de la passkey no válida.');
    if (!datos.subarray(0, 32).equals(sha256(this.dominio))) throw fallo('La passkey es de otro dominio.', 403);
    const banderas = datos[32];
    if (!(banderas & UP) || !(banderas & UV)) throw fallo('La passkey tiene que comprobar que eres tú (huella, cara o PIN).', 403);
    if (alta && !(banderas & AT)) throw fallo('Respuesta de la passkey no válida.');
    return datos.readUInt32BE(33);
  }

  // —— Alta ——

  /** Código de un solo uso para dar de alta otro dispositivo (se pide desde una sesión abierta). */
  codigoAlta() {
    const t = this.ahora();
    for (const [c, expira] of this.altas) if (expira < t) this.altas.delete(c);
    const codigo = [...crypto.randomBytes(10)].map((b) => ALFABETO[b % ALFABETO.length]).join('').match(/.{5}/g).join('-');
    this.altas.set(codigo, t + ALTA_MS);
    return { codigo, expira: ahoraIso(t + ALTA_MS) };
  }

  usarCodigoAlta(codigo) {
    const c = String(codigo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-');
    const expira = this.altas.get(c);
    if (!expira) return false;
    this.altas.delete(c);
    return expira >= this.ahora();
  }

  opcionesAlta() {
    const d = this.leer();
    const usuario = d.usuario ?? b64u(crypto.randomBytes(16));
    return {
      challenge: this.reto('alta', { usuario }),
      rp: { id: this.dominio, name: 'Nullraptor' },
      user: { id: usuario, name: 'dano', displayName: 'Dano' },
      pubKeyCredParams: Object.keys(ALGORITMOS).map((alg) => ({ type: 'public-key', alg: Number(alg) })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      attestation: 'none',
      timeout: RETO_MS,
      excludeCredentials: d.claves.map((c) => ({ type: 'public-key', id: c.id })),
    };
  }

  registrar(r, nombre) {
    const cd = deB64u(r?.clientDataJSON);
    const reto = this.tomarReto(cd, 'alta', 'webauthn.create');
    const datos = deB64u(r.authenticatorData);
    const contador = this.comprobarDatos(datos, true);
    // Credencial dentro de los datos: aaguid (16 bytes) + longitud (2) + id.
    if (datos.length < 55) throw fallo('Respuesta de la passkey no válida.');
    const largo = datos.readUInt16BE(53);
    if (55 + largo > datos.length || b64u(datos.subarray(55, 55 + largo)) !== r.id) throw fallo('La passkey no coincide con su respuesta.');
    if (!(String(r.alg) in ALGORITMOS)) throw fallo('Tipo de passkey no admitido.');
    const clave = deB64u(r.publicKey);
    try { crypto.createPublicKey({ key: clave, format: 'der', type: 'spki' }); } catch { throw fallo('Clave pública no válida.'); }
    const d = this.leer();
    if (d.claves.some((c) => c.id === r.id)) throw fallo('Esa passkey ya está dada de alta.', 409);
    d.usuario ??= reto.usuario;
    const nueva = { id: r.id, clave: b64u(clave), alg: Number(r.alg), contador, nombre: limpiarNombre(nombre), creada: ahoraIso(this.ahora()), usada: null };
    d.claves.push(nueva);
    this.guardar(d);
    return { id: nueva.id, nombre: nueva.nombre };
  }

  // —— Entrada y reautenticación ——

  opcionesEntrada(tipo = 'entrada') {
    return { challenge: this.reto(tipo), rpId: this.dominio, userVerification: 'required', timeout: RETO_MS, allowCredentials: [] };
  }

  verificar(r, tipo = 'entrada') {
    const cd = deB64u(r?.clientDataJSON);
    this.tomarReto(cd, tipo, 'webauthn.get');
    const d = this.leer();
    const c = d.claves.find((x) => x.id === r.id);
    if (!c) throw fallo('Esa passkey no está dada de alta aquí.', 401);
    const datos = deB64u(r.authenticatorData);
    const contador = this.comprobarDatos(datos, false);
    const firma = deB64u(r.signature);
    const clave = crypto.createPublicKey({ key: Buffer.from(c.clave, 'base64url'), format: 'der', type: 'spki' });
    let ok = false;
    try { ok = crypto.verify(ALGORITMOS[String(c.alg)], Buffer.concat([datos, sha256(cd)]), clave, firma); } catch { ok = false; }
    if (!ok) throw fallo('Firma de la passkey no válida.', 401);
    // Contador: si el autenticador lo usa, tiene que subir siempre (si baja, la passkey podría estar copiada).
    if ((contador || c.contador) && contador <= c.contador) throw fallo('Contador de la passkey no válido.', 401);
    c.contador = contador;
    c.usada = ahoraIso(this.ahora());
    this.guardar(d);
    return { id: c.id, nombre: c.nombre };
  }

  borrar(id) {
    const d = this.leer();
    if (!d.claves.some((c) => c.id === id)) return false;
    if (d.claves.length === 1) throw fallo('Es la última passkey: da de alta otra antes de borrarla.', 409);
    d.claves = d.claves.filter((c) => c.id !== id);
    this.guardar(d);
    return true;
  }
}

const COOKIE = '__Host-nr_pk'; // __Host-: solo HTTPS, sin Domain y con Path=/
export const SESION_MS = 12 * 60 * 60_000;
export const INACTIVA_MS = 2 * 60 * 60_000;
export const REAUT_MS = 60 * 60_000;

/** Sesiones con passkey: en memoria (reiniciar el panel cierra todas), 12 h como mucho y 2 h sin uso. */
export class Sesiones {
  constructor({ ahora = Date.now } = {}) {
    this.ahora = ahora;
    this.sesiones = new Map(); // sha256(token) → { creada, ultima, reautenticada, passkey }
  }

  crear(passkey) {
    const token = b64u(crypto.randomBytes(32));
    const t = this.ahora();
    this.sesiones.set(b64u(sha256(token)), { creada: t, ultima: t, reautenticada: t, passkey });
    return token;
  }

  cookie(token) { return `${COOKIE}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESION_MS / 1000}`; }
  get cookieBorrar() { return `${COOKIE}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`; }

  clave(req) {
    const valor = String(req.headers.cookie ?? '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return valor && /^[A-Za-z0-9_-]{43}$/.test(valor) ? b64u(sha256(valor)) : null;
  }

  leer(req) {
    const k = this.clave(req);
    const s = k && this.sesiones.get(k);
    if (!s) return null;
    const t = this.ahora();
    if (t - s.creada > SESION_MS || t - s.ultima > INACTIVA_MS) { this.sesiones.delete(k); return null; }
    s.ultima = t;
    return s;
  }

  reautenticada(s) { return Boolean(s) && this.ahora() - s.reautenticada < REAUT_MS; }

  cerrar(req) { const k = this.clave(req); if (k) this.sesiones.delete(k); }
}
