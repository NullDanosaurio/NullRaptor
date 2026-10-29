// Cofre de credenciales: un archivo cifrado que se abre con una sola clave.
// Cifrado: scrypt (N=2^17) para derivar la clave + AES-256-GCM (detecta clave errónea o archivo alterado).
// Crear:  node scripts/credenciales.mjs crear <entrada.env> <salida.cifrado>   (pide la clave dos veces)
// Ver nombres (sin valores): node scripts/credenciales.mjs listar <archivo.cifrado>
import crypto from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KDF = { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const derivar = (clave, sal, kdf) => crypto.scryptSync(clave.normalize('NFC'), sal, 32, { ...KDF, ...kdf });

export function cifrar(texto, clave) {
  // El cofre viaja dentro de la imagen (descargable): la clave es la única defensa ante ataques sin conexión.
  if (clave.length < 20) throw new Error('La clave debe tener al menos 20 caracteres (mejor 6 palabras al azar).');
  const sal = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derivar(clave, sal, KDF), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  const b = (x) => x.toString('base64');
  return JSON.stringify({ v: 1, kdf: { N: KDF.N, r: KDF.r, p: KDF.p }, sal: b(sal), iv: b(iv), tag: b(c.getAuthTag()), datos: b(datos) });
}

export function descifrar(blob, clave) {
  const o = JSON.parse(blob);
  if (o.v !== 1) throw new Error('Formato de cofre desconocido.');
  const b = (x) => Buffer.from(x, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', derivar(clave, b(o.sal), o.kdf), b(o.iv));
  d.setAuthTag(b(o.tag));
  try { return Buffer.concat([d.update(b(o.datos)), d.final()]).toString('utf8'); }
  catch { throw new Error('Clave incorrecta o cofre alterado.'); }
}

// Formato .env: NOMBRE=valor por línea; # comentarios.
export function leerEnv(texto) {
  const env = {};
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(linea);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

export function pedirClave(pregunta) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(pregunta)) process.stderr.write(s); }; // no muestra lo tecleado
    rl.question(pregunta, (r) => { rl.close(); process.stderr.write('\n'); resolver(r); });
  });
}

// Abre el cofre: clave por AGENTE_CLAVE (servidores) o preguntada en la terminal. Tres intentos.
export async function abrirCofre(ruta) {
  const blob = fs.readFileSync(ruta, 'utf8');
  for (let i = 0; i < 3; i++) {
    const clave = process.env.AGENTE_CLAVE ?? await pedirClave('Clave del agente: ');
    try { return leerEnv(descifrar(blob, clave)); }
    catch (e) { console.error(e.message); if (process.env.AGENTE_CLAVE) break; }
  }
  throw new Error('No se pudo abrir el cofre de credenciales.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [orden, a, b] = process.argv.slice(2);
  if (orden === 'crear' && a && b) {
    const env = leerEnv(fs.readFileSync(a, 'utf8'));
    if (!Object.keys(env).length) { console.error('La entrada no tiene líneas NOMBRE=valor.'); process.exit(1); }
    const c1 = await pedirClave('Nueva clave: '), c2 = await pedirClave('Repite la clave: ');
    if (c1 !== c2) { console.error('Las claves no coinciden.'); process.exit(1); }
    fs.writeFileSync(b, cifrar(Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), c1));
    console.error(`Cofre creado en ${b} con: ${Object.keys(env).join(', ')}. Borra ahora ${a}.`);
  } else if (orden === 'listar' && a) {
    console.log(Object.keys(await abrirCofre(a)).join('\n'));
  } else {
    console.error('Uso: crear <entrada.env> <salida.cifrado> | listar <archivo.cifrado>');
    process.exit(1);
  }
}
