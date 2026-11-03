// App Android de Nullraptor (app-movil/): qué apps pueden usar las passkeys del panel. Se lee de app-movil/firma.json
// (en el repositorio: cambiarlo exige un commit). De ahí salen:
//  - /.well-known/assetlinks.json: Android comprueba en el dominio del panel que la app puede usar sus passkeys;
//  - los orígenes android:apk-key-hash:<sha256 del certificado en base64url> que entrega WebAuthn dentro de la app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIRMA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app-movil', 'firma.json');
const HUELLA = /^[0-9A-F]{2}(:[0-9A-F]{2}){31}$/;
const PAQUETE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** { paquete, huellas: [«AA:BB:…»] } válidos, o null si no hay app configurada. */
export function leerFirma(archivo = FIRMA) {
  let d;
  try { d = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { return null; }
  const huellas = (Array.isArray(d?.huellas) ? d.huellas : []).map((h) => String(h?.sha256 ?? '').toUpperCase()).filter((h) => HUELLA.test(h));
  return PAQUETE.test(d?.paquete ?? '') && huellas.length ? { paquete: d.paquete, huellas } : null;
}

/** Contenido de /.well-known/assetlinks.json (Digital Asset Links). */
export function assetlinks(firma) {
  if (!firma) return [];
  return [{
    relation: ['delegate_permission/common.get_login_creds', 'delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: firma.paquete, sha256_cert_fingerprints: firma.huellas },
  }];
}

/** Orígenes que WebAuthn entrega desde la app (uno por huella). */
export function origenesApp(firma) {
  return (firma?.huellas ?? []).map((h) => `android:apk-key-hash:${Buffer.from(h.replace(/:/g, ''), 'hex').toString('base64url')}`);
}
