// Puente con el PC (Windows) desde el contenedor: node /nullraptor/scripts/pc.mjs <orden> [clave=valor …]
// Al otro lado escucha scripts/puente.ps1, que arranca el lanzador en Windows y corre como el usuario de Daniel.
// En modo completo la IA usa el PC como una persona (PowerShell libre, programas, archivos, pantalla, ratón y
// teclado); en modo consulta, solo las órdenes de consulta. El lanzador pasa la dirección y el token al contenedor:
//   NULLRAPTOR_PUENTE        host:puerto (host.docker.internal:4329)
//   NULLRAPTOR_PUENTE_TOKEN  secreto compartido; sin él, el puente no contesta.
// Protocolo: una línea JSON { token, orden, args } y una línea JSON de vuelta { ok, resultado | error }.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ayuda (la lista que manda es la del PC: «estado» dice el modo y las órdenes que acepta). */
export const ORDENES = {
  estado: 'Modo del puente (completo o consulta) y órdenes que acepta.',
  sistema: 'Windows, equipo, CPU, memoria y discos.',
  procesos: 'Los 40 procesos que más memoria usan.',
  puertos: 'Puertos en escucha en el PC (servicios a los que llegar con host.docker.internal).',
  programas: 'Programas instalados. Opcional: filtro=<texto>.',
  'winget-buscar': 'Busca un programa en winget. texto=<nombre>.',
  'abrir-url': 'Abre una dirección http(s) en el navegador del PC. url=<dirección>.',
  notificar: 'Muestra un aviso en el escritorio. texto=<mensaje> [titulo=<título>].',
  ejecutar: 'PowerShell libre en el PC. Script por la entrada estándar (o script=…). [cwd=C:\\…] [tiempo=<s, máx. 1800>]. Sale con su código.',
  iniciar: 'Lanza un programa sin esperar (ventanas). programa=<ruta o nombre> [args=<argumentos>] [cwd=C:\\…].',
  enviar: 'Copia un archivo del contenedor al PC, por trozos y comprobado (SHA-256). origen=<ruta local> destino=C:\\…',
  traer: 'Copia un archivo del PC al contenedor, por trozos y comprobado (SHA-256). origen=C:\\… destino=<ruta local>',
  ventanas: 'Ventanas abiertas: título, proceso, posición y tamaño (píxeles reales).',
  enfocar: 'Trae una ventana al frente. ventana=<parte del título>.',
  captura: 'Captura la pantalla o una ventana a PNG. [ventana=<título>] [ancho=<máx., 1600>] [salida=<archivo.png>].',
  raton: 'accion=mover|clic|doble|derecho|central|rueda|arrastrar x=… y=… [x2=… y2=…] [cantidad=…]. Coordenadas de pantalla.',
  teclado: 'texto=<se escribe tal cual> o teclas=<SendKeys: {ENTER}, ^s, %{F4}, +{TAB}…>. Va a la ventana activa.',
};

const MAX_RESPUESTA = 120 * 1024 * 1024;

/** «clave=valor» → { clave: valor }. */
export function leerArgs(lista) {
  const args = {};
  for (const a of lista) {
    const i = a.indexOf('=');
    if (i < 1) throw new Error(`Argumento no válido: «${a}» (usa clave=valor).`);
    args[a.slice(0, i)] = a.slice(i + 1);
  }
  return args;
}

/** Manda una orden al puente y devuelve su resultado (lanza si falla). */
export function pedir(orden, args = {}, { env = process.env, ms = 60_000 } = {}) {
  const destino = env.NULLRAPTOR_PUENTE;
  const token = env.NULLRAPTOR_PUENTE_TOKEN;
  if (!destino || !token) return Promise.reject(new Error('No hay puente con el PC: arranca Nullraptor con el lanzador de Windows (Nullraptor.cmd o el acceso directo).'));
  const m = destino.match(/^([\w.-]+):(\d{1,5})$/);
  if (!m) return Promise.reject(new Error(`NULLRAPTOR_PUENTE no válido: ${destino}`));
  return new Promise((listo, fallo) => {
    const s = net.connect(Number(m[2]), m[1]);
    const trozos = [];
    let total = 0;
    const acabar = (e, r) => { s.destroy(); if (e) fallo(e); else listo(r); };
    s.setTimeout(ms, () => acabar(new Error('El puente no contesta (¿está encendido el PC y el lanzador ha arrancado el puente?).')));
    s.on('error', (e) => acabar(new Error(`Sin conexión con el puente del PC (${e.code ?? e.message}).`)));
    s.on('connect', () => s.write(`${JSON.stringify({ token, orden, args })}\n`));
    s.on('data', (d) => {
      trozos.push(d);
      total += d.length;
      if (total > MAX_RESPUESTA) return acabar(new Error('Respuesta del puente demasiado grande.'));
      if (!d.includes(10)) return undefined; // aún sin «\n»
      const texto = Buffer.concat(trozos).toString('utf8');
      let r;
      try { r = JSON.parse(texto.slice(0, texto.indexOf('\n'))); } catch { return acabar(new Error('Respuesta del puente no válida.')); }
      return r.ok ? acabar(null, r.resultado) : acabar(new Error(r.error ?? 'El puente rechazó la orden.'));
    });
    s.on('end', () => { if (!Buffer.concat(trozos).includes(10)) acabar(new Error('El puente cerró sin contestar.')); });
  });
}

/** Lo que pasa en el contenedor antes de pedir: leer el archivo que se envía o el script. Devuelve los args del PC. */
export function preparar(orden, args, { leerEntrada = () => fs.readFileSync(0, 'utf8') } = {}) {
  const a = { ...args };
  if (orden === 'ejecutar' && !a.script) {
    a.script = leerEntrada();
    if (!a.script.trim()) throw new Error('Falta el script: pásalo por la entrada estándar o con script=…');
  }
  if (orden === 'captura') delete a.salida;
  return a;
}

/** Lo que pasa en el contenedor con la respuesta. Devuelve { salida, errores, codigo } para la línea de órdenes. */
export function terminar(orden, args, r, { ahora = new Date() } = {}) {
  if (orden === 'ejecutar') {
    const codigo = r.agotado ? 124 : (r.codigo ?? 1);
    const aviso = r.agotado ? '\n[Tiempo agotado: se paró el proceso en el PC]' : '';
    return { salida: r.salida ?? '', errores: (r.errores ?? '') + aviso, codigo };
  }
  if (orden === 'captura') {
    const archivo = path.resolve(args.salida ?? path.join(os.tmpdir(), `captura-pc-${ahora.toISOString().replace(/[:.]/g, '-')}.png`));
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, Buffer.from(r.png, 'base64'));
    const { png, ...datos } = r;
    return { salida: JSON.stringify({ archivo, ...datos, nota: 'Píxel (px, py) de la imagen = pantalla (x + px / escala, y + py / escala).' }, null, 2), codigo: 0 };
  }
  return { salida: typeof r === 'string' ? r : JSON.stringify(r, null, 2), codigo: 0 };
}

export const TROZO = 4 * 1024 * 1024; // por petición (el puente acepta hasta 8 MB)
const progreso = (hecho, total, aviso) => { if (total > 64 * TROZO && aviso) aviso(`${Math.floor((hecho / total) * 100)} % (${(hecho / 1048576).toFixed(0)} de ${(total / 1048576).toFixed(0)} MB)`); };

/** Contenedor → PC por trozos. Comprueba al final que el SHA-256 del PC es el del archivo local. */
export async function enviarArchivo(origen, destino, { pedirA = pedir, trozo = TROZO, aviso = null } = {}) {
  const total = fs.statSync(origen).size;
  const hash = createHash('sha256');
  const fd = fs.openSync(origen, 'r');
  const buf = Buffer.alloc(trozo);
  let posicion = 0;
  let r;
  try {
    do {
      const n = fs.readSync(fd, buf, 0, trozo, posicion);
      hash.update(buf.subarray(0, n));
      const final = posicion + n >= total;
      r = await pedirA('enviar', { destino, posicion, datos: buf.subarray(0, n).toString('base64'), final });
      posicion += n;
      if (!final) progreso(posicion, total, aviso);
      if (final) break;
      if (n === 0) throw new Error('El archivo local ha cambiado mientras se enviaba.');
    } while (true); // eslint-disable-line no-constant-condition
  } finally { fs.closeSync(fd); }
  const local = hash.digest('hex');
  if (r?.sha256 !== local) throw new Error(`El archivo llegó distinto al PC (SHA-256 ${r?.sha256 ?? '¿?'} en vez de ${local}).`);
  return { origen: path.resolve(origen), destino: r.destino, bytes: r.bytes, sha256: local };
}

/** PC → contenedor por trozos, a un «.parcial» que se renombra cuando el SHA-256 coincide. */
export async function traerArchivo(origen, destino, { pedirA = pedir, trozo = TROZO, aviso = null } = {}) {
  const final = path.resolve(destino);
  const parcial = `${final}.parcial`;
  fs.mkdirSync(path.dirname(final), { recursive: true });
  const hash = createHash('sha256');
  const fd = fs.openSync(parcial, 'w');
  let posicion = 0;
  let r;
  try {
    for (;;) {
      r = await pedirA('traer', { origen, posicion, tamano: trozo });
      const datos = Buffer.from(r.datos ?? '', 'base64');
      fs.writeSync(fd, datos, 0, datos.length, posicion);
      hash.update(datos);
      posicion += datos.length;
      if (r.sha256) break;
      if (!datos.length) throw new Error('El PC dejó de mandar datos antes de acabar.');
      progreso(posicion, r.total, aviso);
    }
  } finally { fs.closeSync(fd); }
  const local = hash.digest('hex');
  if (posicion !== r.total || r.sha256 !== local) {
    fs.rmSync(parcial, { force: true });
    throw new Error('El archivo cambió en el PC mientras se traía o llegó dañado: vuelve a intentarlo.');
  }
  fs.renameSync(parcial, final);
  return { origen, destino: final, bytes: posicion, sha256: local };
}

function ayuda() {
  const ancho = Math.max(...Object.keys(ORDENES).map((k) => k.length));
  return ['Uso: node /nullraptor/scripts/pc.mjs <orden> [clave=valor …]', '', ...Object.entries(ORDENES).map(([k, v]) => `  ${k.padEnd(ancho)}  ${v}`)].join('\n');
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const [orden, ...resto] = process.argv.slice(2);
  if (!orden || orden === '-h' || orden === '--help' || orden === 'ayuda') { console.log(ayuda()); process.exit(orden ? 0 : 1); }
  try {
    const args = leerArgs(resto);
    const ms = orden === 'ejecutar' ? (Number(args.tiempo) || 120) * 1000 + 30_000 : 5 * 60_000;
    let fin;
    if (orden === 'enviar' || orden === 'traer') {
      if (!args.origen || !args.destino) throw new Error(`Uso: ${ORDENES[orden]}`);
      const aviso = (t) => process.stderr.write(`${t}\n`);
      const r = orden === 'enviar' ? await enviarArchivo(args.origen, args.destino, { aviso }) : await traerArchivo(args.origen, args.destino, { aviso });
      fin = { salida: JSON.stringify(r, null, 2), codigo: 0 };
    } else {
      fin = terminar(orden, args, await pedir(orden, preparar(orden, args), { ms }));
    }
    if (fin.salida) process.stdout.write(fin.salida.endsWith('\n') ? fin.salida : `${fin.salida}\n`);
    if (fin.errores) process.stderr.write(fin.errores.endsWith('\n') ? fin.errores : `${fin.errores}\n`);
    process.exitCode = fin.codigo;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
