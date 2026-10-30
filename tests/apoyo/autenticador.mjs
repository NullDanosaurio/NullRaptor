// Autenticador simulado para las pruebas: claves P-256 reales de node:crypto, respuestas como las del navegador.
import crypto from 'node:crypto';

export const DOMINIO = 'pc.colita.ts.net';
export const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (d) => crypto.createHash('sha256').update(d).digest();
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };

/** Autenticador de mentira con una clave real: genera las respuestas que daría el navegador. */
export function autenticador(dominio = DOMINIO) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const id = crypto.randomBytes(16);
  let contador = 0;
  const cliente = (tipo, challenge, origen) => Buffer.from(JSON.stringify({ type: tipo, challenge, origin: origen ?? `https://${DOMINIO}` }));
  return {
    id: b64u(id),
    alta(o, { origen, banderas = 0x45 } = {}) {
      const cd = cliente('webauthn.create', o.challenge, origen);
      const ad = Buffer.concat([sha256(dominio), Buffer.from([banderas]), u32(0), Buffer.alloc(16), u16(id.length), id, Buffer.from([0xa0])]);
      return { id: b64u(id), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), publicKey: b64u(publicKey.export({ type: 'spki', format: 'der' })), alg: -7 };
    },
    entrar(o, { origen, banderas = 0x05, fijo } = {}) {
      contador = fijo ?? contador + 1;
      const cd = cliente('webauthn.get', o.challenge, origen);
      const ad = Buffer.concat([sha256(dominio), Buffer.from([banderas]), u32(contador)]);
      return { id: b64u(id), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(crypto.sign('sha256', Buffer.concat([ad, sha256(cd)]), privateKey)) };
    },
  };
}
