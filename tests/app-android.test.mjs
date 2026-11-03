// App Android (panel/lib/app-android.mjs y Passkeys): assetlinks.json y origen android:apk-key-hash de la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assetlinks, leerFirma, origenesApp } from '../panel/lib/app-android.mjs';
import { Passkeys } from '../panel/lib/passkey.mjs';

const HUELLA = 'D1:12:58:E7:04:BF:C0:4F:1D:78:8A:6B:B5:57:A6:A7:B6:A8:FC:EC:1E:E2:9A:13:43:C5:6D:31:48:AD:80:00';
const escribir = (datos) => { const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'firma-')), 'firma.json'); fs.writeFileSync(f, JSON.stringify(datos)); return f; };

test('la firma del repositorio es válida y sale en assetlinks.json', () => {
  const firma = leerFirma();
  assert.equal(firma.paquete, 'es.nullraptor.movil');
  assert.ok(firma.huellas.includes(HUELLA));
  const [d] = assetlinks(firma);
  assert.deepEqual(d.relation, ['delegate_permission/common.get_login_creds', 'delegate_permission/common.handle_all_urls']);
  assert.deepEqual(d.target, { namespace: 'android_app', package_name: 'es.nullraptor.movil', sha256_cert_fingerprints: firma.huellas });
});

test('leerFirma descarta lo que no es válido; sin app, assetlinks vacío', () => {
  assert.equal(leerFirma('/no/existe.json'), null);
  assert.equal(leerFirma(escribir({ paquete: 'Mal paquete', huellas: [{ sha256: HUELLA }] })), null);
  assert.deepEqual(leerFirma(escribir({ paquete: 'es.a.b', huellas: [{ sha256: 'AA:BB' }, { sha256: HUELLA.toLowerCase() }] })).huellas, [HUELLA]);
  assert.deepEqual(assetlinks(null), []);
});

test('origen de la app: sha256 del certificado en base64url, como lo entrega Android', () => {
  const [o] = origenesApp({ paquete: 'es.a.b', huellas: [HUELLA] });
  assert.equal(o, `android:apk-key-hash:${Buffer.from(HUELLA.replace(/:/g, ''), 'hex').toString('base64url')}`);
  assert.match(o, /^android:apk-key-hash:[A-Za-z0-9_-]{43}$/);
});

test('Passkeys acepta el origen de la app autorizada y rechaza otros', () => {
  const origen = origenesApp({ paquete: 'es.a.b', huellas: [HUELLA] })[0];
  const p = new Passkeys({ archivo: '/no/existe', dominio: 'equipo.red.ts.net', origenesApp: [origen] });
  const intento = (o) => {
    const reto = p.reto('entrada');
    return () => p.tomarReto(Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: reto, origin: o })), 'entrada', 'webauthn.get');
  };
  assert.doesNotThrow(intento(origen));
  assert.doesNotThrow(intento('https://equipo.red.ts.net'));
  assert.throws(intento('android:apk-key-hash:otra'), (e) => e.codigo === 403);
  assert.throws(intento('https://otro.ts.net'), (e) => e.codigo === 403);
});
