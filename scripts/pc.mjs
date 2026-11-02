// Puente con el PC (Windows) desde el contenedor: node /nullraptor/scripts/pc.mjs <orden> [clave=valor …]
// Al otro lado escucha scripts/puente.ps1, que arranca el lanzador en Windows y corre como el usuario de Daniel.
// En modo completo la IA usa el PC como una persona (PowerShell libre, programas, archivos, pantalla, ratón y
// teclado); en modo consulta, solo las órdenes de consulta. El lanzador pasa la dirección y el token al contenedor:
//   NULLRAPTOR_PUENTE        host:puerto (host.docker.internal:4329)
//   NULLRAPTOR_PUENTE_TOKEN  secreto compartido; sin él, el puente no contesta.
// Protocolo: una línea JSON { token, orden, args } y una línea JSON de vuelta { ok, resultado | error }.
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
  enviar: 'Copia un archivo del contenedor al PC (máx. 50 MB). origen=<ruta local> destino=C:\\…',
  traer: 'Copia un archivo del PC al contenedor (máx. 50 MB). origen=C:\\… destino=<ruta local>',
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
  if (orden === 'enviar') {
    if (!a.origen || !a.destino) throw new Error('Uso: enviar origen=<ruta local> destino=C:\\…');
    a.datos = fs.readFileSync(a.origen).toString('base64');
    delete a.origen;
  }
  if (orden === 'traer') {
    if (!a.origen || !a.destino) throw new Error('Uso: traer origen=C:\\… destino=<ruta local>');
    delete a.destino; // es local
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
  if (orden === 'traer') {
    fs.mkdirSync(path.dirname(path.resolve(args.destino)), { recursive: true });
    fs.writeFileSync(args.destino, Buffer.from(r.datos, 'base64'));
    return { salida: JSON.stringify({ origen: r.origen, destino: path.resolve(args.destino), bytes: r.bytes }, null, 2), codigo: 0 };
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
    const r = await pedir(orden, preparar(orden, args), { ms });
    const fin = terminar(orden, args, r);
    if (fin.salida) process.stdout.write(fin.salida.endsWith('\n') ? fin.salida : `${fin.salida}\n`);
    if (fin.errores) process.stderr.write(fin.errores.endsWith('\n') ? fin.errores : `${fin.errores}\n`);
    process.exitCode = fin.codigo;
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
