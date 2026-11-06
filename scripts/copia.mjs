// Copia de seguridad cifrada del estado de Nullraptor (el volumen /estado).
// Cifrado híbrido: cada copia usa una clave AES-256-GCM al azar, guardada envuelta con la clave PÚBLICA RSA. En el
// volumen solo vive la pública (la copia diaria no necesita que nadie teclee nada); la privada, con frase, la guarda
// Daniel fuera del volumen.
//   node scripts/copia.mjs clave <privada-fuera-del-volumen> [publica]   crea el par de claves (pide la frase)
//   node scripts/copia.mjs crear [--extra <carpeta>] [--conservar N]     copia, rota y avisa de proyectos sin subir
//   node scripts/copia.mjs restaurar <copia.tar.gz.enc> <destino> <privada>   solo a una carpeta vacía o nueva
//   node scripts/copia.mjs estado                                         última copia y su antigüedad (JSON)
// No entran credenciales, passkeys ni el cofre; los proyectos (repos git) tampoco: se avisa de lo que no está subido.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { pedirClave } from './credenciales.mjs';

export const BASE = process.env.NULLRAPTOR_ESTADO ?? '/estado';
/** Rutas (relativas al volumen) que no se pueden rehacer: memoria de Ruflo, estado del panel y notas. */
export const ORIGENES = ['ruflo', 'sistema/apt-paquetes.txt', ...['actualizacion', 'adjuntos', 'chats', 'equipo', 'flujo', 'herramientas', 'memoria', 'registros', '.relevo'].map((c) => `trabajo/${c}`)];
const EXCLUIR = ['node_modules', '.venv', '__pycache__', '.credentials.json', 'auth.json', 'passkeys.json', 'panel-codigo', '*.pem', '.env'];
/** La frase llega por COPIA_FRASE o se pregunta en la terminal; sin terminal no se puede preguntar. */
async function pedirFrase(pregunta) {
  if (process.env.COPIA_FRASE) return process.env.COPIA_FRASE;
  if (!process.stdin.isTTY) throw new Error('No hay terminal para pedir la frase: ejecútalo en una terminal interactiva o pásala en COPIA_FRASE.');
  return pedirClave(pregunta);
}
const OAEP = { padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
const SUFIJO = '.tar.gz.enc';

/** Orígenes que existen hoy, más la memoria de Claude de cada proyecto (solo su carpeta «memory»). */
export function origenesExistentes(base = BASE) {
  const extra = [];
  const proyectos = path.join(base, 'home', '.claude', 'projects');
  try { for (const p of fs.readdirSync(proyectos)) extra.push(path.join('home', '.claude', 'projects', p, 'memory')); } catch { /* sin memoria de Claude */ }
  return [...ORIGENES, ...extra].filter((o) => fs.existsSync(path.join(base, o)));
}

export function generarClaves({ privada, publica, frase, base = BASE }) {
  if (frase.length < 20) throw new Error('La frase debe tener al menos 20 caracteres.');
  const rel = path.relative(path.resolve(base), path.resolve(privada));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) throw new Error('La clave privada no puede quedarse dentro del volumen.');
  const par = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: frase },
  });
  fs.mkdirSync(path.dirname(publica), { recursive: true });
  fs.writeFileSync(publica, par.publicKey);
  fs.writeFileSync(privada, par.privateKey, { mode: 0o600 });
}

export async function crearCopia({ base = BASE, destino = path.join(base, 'copias'), publica = path.join(destino, 'clave-publica.pem'), ahora = new Date(), origenes } = {}) {
  const pem = fs.readFileSync(publica); // sin clave pública no hay copia
  const lista = origenes ?? origenesExistentes(base);
  if (!lista.length) throw new Error('No hay nada que copiar.');
  fs.mkdirSync(destino, { recursive: true, mode: 0o700 });
  const sello = ahora.toISOString().replace(/\..*/, '').replace(/[-:]/g, '').replace('T', '-');
  const final = path.join(destino, `copia-${sello}${SUFIJO}`), parcial = `${final}.parcial`;
  const clave = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const cif = crypto.createCipheriv('aes-256-gcm', clave, iv);
  const tar = spawn('tar', ['-czf', '-', '-C', base, ...EXCLUIR.flatMap((e) => ['--exclude', e]), ...lista], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errores = '';
  tar.stderr.on('data', (d) => { errores += d; });
  const cerrado = once(tar, 'close');
  try {
    await pipeline(tar.stdout, cif, fs.createWriteStream(parcial, { mode: 0o600 }));
    const [codigo] = await cerrado;
    if (codigo > 1) throw new Error(`tar falló (${codigo}): ${errores.trim().slice(-300)}`); // 1 = un archivo cambió mientras se leía
  } catch (e) { tar.kill(); fs.rmSync(parcial, { force: true }); throw e; }
  const meta = { v: 1, fecha: ahora.toISOString(), origenes: lista, iv: iv.toString('base64'), tag: cif.getAuthTag().toString('base64'), clave: crypto.publicEncrypt({ key: pem, ...OAEP }, clave).toString('base64') };
  fs.writeFileSync(final.replace(SUFIJO, '.json'), JSON.stringify(meta, null, 2), { mode: 0o600 });
  fs.renameSync(parcial, final); // el .enc solo existe cuando su .json ya está
  return { archivo: final, bytes: fs.statSync(final).size, origenes: lista };
}

export const copiasEn = (destino) => {
  try { return fs.readdirSync(destino).filter((n) => /^copia-.*\.tar\.gz\.enc$/.test(n)).sort().reverse(); } catch { return []; }
};

/** Deja las `conservar` copias más recientes; devuelve las borradas. */
export function rotar(destino, conservar = 7) {
  const sobran = copiasEn(destino).slice(Math.max(1, conservar));
  for (const n of sobran) for (const f of [n, n.replace(SUFIJO, '.json')]) fs.rmSync(path.join(destino, f), { force: true });
  return sobran;
}

export function estado(destino, ahora = new Date()) {
  const [ultima] = copiasEn(destino);
  if (!ultima) return { copias: 0, ultima: null, horas: null };
  let fecha = null;
  try { fecha = JSON.parse(fs.readFileSync(path.join(destino, ultima.replace(SUFIJO, '.json')), 'utf8')).fecha; } catch { /* sin .json */ }
  return { copias: copiasEn(destino).length, ultima, fecha, horas: fecha ? Math.round((ahora - new Date(fecha)) / 36e5) : null };
}

/** Restaura en una carpeta vacía o nueva (nunca sobrescribe). Comprueba la autenticidad ANTES de extraer nada. */
export async function restaurar({ copia, destino, privada, frase }) {
  if (fs.existsSync(destino) && fs.readdirSync(destino).length) throw new Error('El destino no está vacío: restaura en una carpeta nueva.');
  const meta = JSON.parse(fs.readFileSync(copia.replace(SUFIJO, '.json'), 'utf8'));
  const b = (x) => Buffer.from(x, 'base64');
  let clave;
  try { clave = crypto.privateDecrypt({ key: crypto.createPrivateKey({ key: fs.readFileSync(privada), passphrase: frase }), ...OAEP }, b(meta.clave)); }
  catch { throw new Error('Frase o clave privada incorrectas.'); }
  const dec = crypto.createDecipheriv('aes-256-gcm', clave, b(meta.iv));
  dec.setAuthTag(b(meta.tag));
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'restaurar-'));
  const plano = path.join(temporal, 'copia.tar.gz');
  try {
    try { await pipeline(fs.createReadStream(copia), dec, fs.createWriteStream(plano, { mode: 0o600 })); }
    catch { throw new Error('La copia está alterada o incompleta.'); }
    fs.mkdirSync(destino, { recursive: true });
    execFileSync('tar', ['-xzf', plano, '-C', destino]);
  } finally { fs.rmSync(temporal, { recursive: true, force: true }); }
  return meta.origenes;
}

/** Proyectos con trabajo que solo existe aquí: cambios sin confirmar o commits sin subir. */
export function proyectosSinSubir(trabajo) {
  const dir = path.join(trabajo, 'proyectos');
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const fuera = [];
  let nombres = [];
  try { nombres = fs.readdirSync(dir); } catch { return fuera; }
  for (const proyecto of nombres) {
    const cwd = path.join(dir, proyecto);
    try {
      const sucios = git(cwd, 'status', '--porcelain').split('\n').filter(Boolean).length;
      let sinSubir = null; // null = sin rama remota
      try { sinSubir = Number(git(cwd, 'rev-list', '--count', '@{u}..').trim()); } catch { /* sin remoto */ }
      if (sucios || sinSubir !== 0) fuera.push({ proyecto, sucios, sinSubir });
    } catch { /* no es un repositorio */ }
  }
  return fuera;
}

/** Segunda copia fuera del volumen: la del volumen no salva de perder el volumen. Por defecto, el PC si está montado. */
export const extraPorDefecto = (env = process.env) => (env.NULLRAPTOR_COPIA_EXTRA ?? (fs.existsSync('/pc/Nullraptor') ? '/pc/Nullraptor/copias' : '')) || null;

/** Copia + rotación + segunda copia + aviso de proyectos sin subir. Lo usan la orden `crear` y la copia diaria del panel. */
export async function ejecutarCopia({ base = BASE, conservar = 7, extra = null, ahora = new Date() } = {}) {
  const destino = path.join(base, 'copias');
  const r = await crearCopia({ base, destino, ahora });
  const borradas = rotar(destino, conservar).length;
  if (extra) {
    fs.mkdirSync(extra, { recursive: true });
    for (const f of [r.archivo, r.archivo.replace(SUFIJO, '.json')]) fs.copyFileSync(f, path.join(extra, path.basename(f)));
    rotar(extra, conservar);
  }
  return { ...r, borradas, extra, sinSubir: proyectosSinSubir(path.join(base, 'trabajo')) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [orden, ...resto] = process.argv.slice(2);
  const opcion = (n) => { const i = resto.indexOf(n); return i >= 0 ? resto[i + 1] : undefined; };
  const destino = path.join(BASE, 'copias');
  try {
    if (orden === 'clave' && resto[0]) {
      const f1 = await pedirFrase('Frase de la clave privada (20+ caracteres): ');
      if (!process.env.COPIA_FRASE && f1 !== await pedirFrase('Repite la frase: ')) throw new Error('Las frases no coinciden.');
      generarClaves({ privada: resto[0], publica: resto[1] ?? path.join(destino, 'clave-publica.pem'), frase: f1 });
      console.error(`Listo. Guarda ${resto[0]} y la frase fuera del volumen: sin ellas no se puede restaurar.`);
    } else if (orden === 'crear') {
      console.log(JSON.stringify(await ejecutarCopia({ conservar: Number(opcion('--conservar') ?? 7), extra: opcion('--extra') ?? extraPorDefecto() }), null, 2));
    } else if (orden === 'restaurar' && resto.length >= 3) {
      const origenes = await restaurar({ copia: resto[0], destino: resto[1], privada: resto[2], frase: await pedirFrase('Frase de la clave privada: ') });
      console.log(`Restaurado en ${resto[1]}: ${origenes.join(', ')}`);
    } else if (orden === 'estado') {
      console.log(JSON.stringify(estado(destino)));
    } else {
      console.error('Uso: clave <privada> [publica] | crear [--extra <carpeta>] [--conservar N] | restaurar <copia> <destino> <privada> | estado');
      process.exit(1);
    }
  } catch (e) { console.error(e.message); process.exit(1); }
}
