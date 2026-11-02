// Puente con el PC (Windows) desde el contenedor: node /nullraptor/scripts/pc.mjs <orden> [clave=valor …]
// Al otro lado escucha scripts/puente.ps1, que arranca el lanzador en Windows. Solo ejecuta las órdenes de su lista
// blanca (ORDENES, abajo), nunca una orden libre. El lanzador pasa la dirección y el token al contenedor:
//   NULLRAPTOR_PUENTE        host:puerto (host.docker.internal:4329)
//   NULLRAPTOR_PUENTE_TOKEN  secreto compartido; sin él, el puente no contesta.
// Protocolo: una línea JSON { token, orden, args } y una línea JSON de vuelta { ok, resultado | error }.
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Las mismas que acepta puente.ps1 (la ayuda sale de aquí; la lista que manda es la del PC). */
export const ORDENES = {
  estado: 'Comprueba que el puente responde y qué órdenes acepta.',
  sistema: 'Windows, equipo, CPU, memoria y discos.',
  procesos: 'Los 40 procesos que más memoria usan.',
  puertos: 'Puertos en escucha en el PC (servicios a los que llegar con host.docker.internal).',
  programas: 'Programas instalados. Opcional: filtro=<texto>.',
  'winget-buscar': 'Busca un programa en winget (no instala). texto=<nombre>.',
  'abrir-url': 'Abre una dirección http(s) en el navegador del PC. url=<dirección>.',
  notificar: 'Muestra un aviso en el escritorio. texto=<mensaje> [titulo=<título>].',
};

const MAX_RESPUESTA = 4 * 1024 * 1024;

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
    let recibido = '';
    const acabar = (e, r) => { s.destroy(); if (e) fallo(e); else listo(r); };
    s.setTimeout(ms, () => acabar(new Error('El puente no contesta (¿está encendido el PC y el lanzador ha arrancado el puente?).')));
    s.on('error', (e) => acabar(new Error(`Sin conexión con el puente del PC (${e.code ?? e.message}).`)));
    s.on('connect', () => s.write(`${JSON.stringify({ token, orden, args })}\n`));
    s.setEncoding('utf8');
    s.on('data', (d) => {
      recibido += d;
      if (recibido.length > MAX_RESPUESTA) return acabar(new Error('Respuesta del puente demasiado grande.'));
      const fin = recibido.indexOf('\n');
      if (fin < 0) return undefined;
      let r;
      try { r = JSON.parse(recibido.slice(0, fin)); } catch { return acabar(new Error('Respuesta del puente no válida.')); }
      return r.ok ? acabar(null, r.resultado) : acabar(new Error(r.error ?? 'El puente rechazó la orden.'));
    });
    s.on('end', () => { if (!recibido.includes('\n')) acabar(new Error('El puente cerró sin contestar.')); });
  });
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
    const r = await pedir(orden, leerArgs(resto));
    console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
