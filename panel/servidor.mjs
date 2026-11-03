// Panel web de Nullraptor: chat con Claude y Codex, trabajo (proyectos y flujo) y bóveda, en un solo sitio.
//   node scripts/preparar.mjs node panel/servidor.mjs     (o `npm run panel`): abre el cofre y la memoria antes.
// Por defecto, solo para este equipo: escucha en PANEL_HOST (127.0.0.1; en Docker 0.0.0.0 con el puerto publicado en
// 127.0.0.1) y rechaza peticiones con otro Host (DNS rebinding) o sin la cabecera X-Nullraptor (CSRF desde otras webs).
// Con PANEL_RED=1 acepta también la red de casa (IP privada o nombre del equipo) y exige el código de acceso.
// Con PANEL_DOMINIO (el nombre que da `tailscale serve`, p. ej. pc.tailnet.ts.net) acepta ese dominio y todo lo que
// llega por él exige passkey (lib/passkey.mjs, lib/entrada.mjs); la terminal pide además confirmarla cada hora.
// La web se construye con `npm run panel:construir` (panel/dist). Sin dependencias en tiempo de ejecución.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Actualizacion } from './lib/actualizacion.mjs';
import { crearAcceso, hostRed, leerOCrearCodigo, paginaEntrar } from './lib/acceso.mjs';
import { buscar, cambiosRecientes, estadoGit, grafo, leerNota, listarNotas } from './lib/boveda.mjs';
import { Chats } from './lib/chats.mjs';
import { crearEntrada, esRemota, hostDominio, quienEs } from './lib/entrada.mjs';
import { Passkeys, Sesiones } from './lib/passkey.mjs';
import { Registro } from './lib/registro.mjs';
import { Remoto } from './lib/remoto.mjs';
import { Equipo } from './lib/equipo.mjs';
import { Proyectos } from './lib/proyectos.mjs';
import { crearRutasEquipo } from './lib/rutas-equipo.mjs';
import { crearRutasVoz } from './lib/rutas-voz.mjs';
import { assetlinks, leerFirma, origenesApp } from './lib/app-android.mjs';
import { Voz } from './lib/voz.mjs';
import { crearRutasHerramientas } from './lib/rutas-herramientas.mjs';
import { crearRutasProyectos } from './lib/rutas-proyectos.mjs';
import { crearRutasRemoto } from './lib/rutas-remoto.mjs';
import { escribirMcp } from '../scripts/ia.mjs';
import { detalleProyecto, estadoMcp, listarProyectos, rutaProyecto } from './lib/trabajo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(AQUI, 'dist');
const MAX_CUERPO = 64 * 1024;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
};

/** Host permitido: localhost o 127.0.0.1 (con o sin puerto). */
export function hostPermitido(host) {
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(String(host ?? ''));
}

/** Petición que cambia algo: misma procedencia (si hay Origin) y cabecera propia (fuerza preflight CORS, que no damos).
 * Con `origenExacto` (peticiones por Tailscale), el Origin es obligatorio y tiene que ser ese. */
export function escrituraPermitida(req, permitido = hostPermitido, origenExacto = null) {
  if (req.headers['x-nullraptor'] !== '1') return false;
  const origen = req.headers.origin;
  if (origenExacto) return origen === origenExacto;
  if (!origen) return true;
  try { return permitido(new URL(origen).host) && new URL(origen).host === req.headers.host; } catch { return false; }
}

function json(res, codigo, datos, extra = {}) {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD, ...extra });
  res.end(JSON.stringify(datos));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let tam = 0;
    const trozos = [];
    req.on('data', (d) => {
      tam += d.length;
      if (tam > MAX_CUERPO) { reject(Object.assign(new Error('Petición demasiado grande.'), { codigo: 413 })); req.destroy(); return; }
      trozos.push(d);
    });
    req.on('end', () => {
      try { resolve(trozos.length ? JSON.parse(Buffer.concat(trozos).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON no válido.'), { codigo: 400 })); }
    });
    req.on('error', reject);
  });
}

function servirEstatico(res, ruta) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('La web del panel no está construida: ejecuta «npm run panel:construir» en la carpeta del agente.');
    return;
  }
  let destino = path.resolve(DIST, `.${decodeURIComponent(ruta)}`);
  if (!destino.startsWith(DIST + path.sep) || !fs.existsSync(destino) || fs.statSync(destino).isDirectory()) {
    destino = path.join(DIST, 'index.html'); // SPA: cualquier otra ruta es la aplicación
  }
  const ext = path.extname(destino);
  const inmutable = destino.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, { 'Content-Type': TIPOS[ext] ?? 'application/octet-stream', 'Cache-Control': inmutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...SEGURIDAD });
  fs.createReadStream(destino).pipe(res);
}

function html(res, codigo, cuerpo, extra = {}) {
  res.writeHead(codigo, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURIDAD, ...extra });
  res.end(cuerpo);
}

function leerFormulario(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (d) => { datos += d; if (datos.length > 4096) { reject(Object.assign(new Error('Petición demasiado grande.'), { codigo: 413 })); req.destroy(); } });
    req.on('end', () => resolve(new URLSearchParams(datos)));
    req.on('error', reject);
  });
}

// /entrar: GET muestra el formulario (o entra con ?codigo=, lo usa el lanzador en este equipo); POST lo comprueba.
async function entrar(req, res, url, acceso, permitido) {
  const yaDentro = () => html(res, 303, '', { Location: '/', 'Set-Cookie': acceso.cookie });
  let intento = url.searchParams.get('codigo');
  if (req.method === 'POST') {
    // Con Referrer-Policy no-referrer el navegador manda «Origin: null» en un formulario: se acepta aquí, porque
    // entrar exige el código igualmente (lo peor sería meter a alguien en una sesión de quien ya lo conoce).
    if (req.headers.origin && req.headers.origin !== 'null' && !escrituraPermitida({ headers: { ...req.headers, 'x-nullraptor': '1' } }, permitido)) { html(res, 403, paginaEntrar('Petición no permitida.')); return; }
    intento = (await leerFormulario(req)).get('codigo');
  } else if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  if (intento === null || intento === undefined) { if (acceso.autenticado(req)) { yaDentro(); return; } html(res, 200, paginaEntrar()); return; }
  const r = acceso.probar(intento);
  if (r === 'ok') { yaDentro(); return; }
  html(res, r === 'bloqueado' ? 429 : 401, paginaEntrar(r === 'bloqueado' ? 'Demasiados intentos: espera un minuto.' : 'Código incorrecto.'));
}

export function crearServidor({
  trabajo, memoria, acceso = null, registro = null, remoto = new Remoto({ trabajo, memoria, registro }),
  dominio = null, passkeys = null, sesiones = new Sesiones(), codigoLanzador = () => 'mal', actualizacion = null,
  env = process.env, prepararMcp = null, proyectos = new Proyectos({ trabajo, memoria, env }),
  equipo = new Equipo({ trabajo, env }), voz = new Voz(),
}) {
  if (dominio && !passkeys) throw new Error('Con PANEL_DOMINIO hacen falta las passkeys.');
  const permitido = (host) => (acceso ? hostRed(host) : hostPermitido(host)) || hostDominio(host, dominio);
  const origenRemoto = dominio ? `https://${dominio}` : null;
  const chats = new Chats({ trabajo, memoria });
  const entrada = dominio ? crearEntrada({ passkeys, sesiones, codigoLanzador, registro, leerCuerpo, json, html }) : null;
  const rutasRemoto = crearRutasRemoto({ remoto, passkeys, sesiones, registro, dominio, leerCuerpo, json });
  // Al aprobar o desactivar una herramienta se rehace la configuración MCP: la usan las sesiones que se abran después.
  const alCambiar = () => { try { prepararMcp?.(); } catch (e) { console.warn(`[panel] MCP: ${e.message}`); } };
  const rutasHerramientas = crearRutasHerramientas({ trabajo, env, sesiones, registro, alCambiar, leerCuerpo, json });
  const rutasProyectos = crearRutasProyectos({ proyectos, sesiones, registro, leerCuerpo, json });
  const rutasEquipo = crearRutasEquipo({ equipo, sesiones, registro, leerCuerpo, json });
  const rutasVoz = crearRutasVoz({ voz, leerCuerpo, json });
  // Para la actualización automática: cuántas sesiones hay abiertas (la tarea de Windows no corta ninguna).
  let latido = null;
  if (actualizacion) {
    const publicar = () => { try { actualizacion.publicar(remoto.activas().length + chats.lista().length); } catch (e) { console.warn(`[panel] actualización: ${e.message}`); } };
    publicar();
    latido = setInterval(publicar, 20_000);
    latido.unref?.();
  }
  const sinBoveda = () => ({ error: 'Sin bóveda: arranca el panel con preparar.mjs (BOVEDA_DIR).' });

  const rutas = {
    'GET /api/resumen': () => ({
      boveda: memoria ? { git: estadoGit(memoria), notas: listarNotas(memoria).length, cambios: cambiosRecientes(memoria, 6) } : null,
      proyectos: listarProyectos(trabajo, memoria),
      mcp: estadoMcp(memoria),
      chats: chats.lista(),
      guardados: chats.guardados().slice(0, 5),
      remoto: remoto.lista().filter((s) => s.estado !== 'terminada'),
      hoy: new Date().toISOString().slice(0, 10),
    }),
    // Ajustes: versión de la imagen, cómo se entra, carpetas y servidores MCP.
    'GET /api/ajustes': () => ({
      version: /^[0-9a-f]{7,40}$/.test(env.NULLRAPTOR_REVISION ?? '') ? env.NULLRAPTOR_REVISION : null, // «local» sin la CI
      acceso: { red: Boolean(acceso), dominio },
      carpetas: { trabajo, boveda: memoria },
      mcp: estadoMcp(memoria),
      github: Boolean(env.GITHUB_TOKEN),
    }),
    'GET /api/actualizacion': () => actualizacion?.estado() ?? { disponible: null, solicitada: null },
    'POST /api/actualizacion/ahora': (_q, _c, { quien }) => (actualizacion ? actualizacion.solicitar(quien) : [404, { error: 'Sin actualización automática.' }]),
    'GET /api/proyectos': () => listarProyectos(trabajo, memoria),
    'GET /api/proyecto': (q) => detalleProyecto(trabajo, q.get('nombre'), memoria) ?? [404, { error: 'Proyecto no encontrado en este equipo.' }],
    'GET /api/boveda/notas': () => (memoria ? listarNotas(memoria) : [503, sinBoveda()]),
    'GET /api/boveda/nota': (q) => (memoria ? leerNota(memoria, q.get('ruta')) ?? [404, { error: 'Nota no encontrada.' }] : [503, sinBoveda()]),
    'GET /api/boveda/buscar': (q) => (memoria ? buscar(memoria, q.get('q')) : [503, sinBoveda()]),
    'GET /api/boveda/grafo': () => (memoria ? grafo(memoria) : [503, sinBoveda()]),
    'GET /api/boveda/cambios': () => (memoria ? cambiosRecientes(memoria, 20) : [503, sinBoveda()]),
    'GET /api/chats': () => ({ abiertos: chats.lista(), guardados: chats.guardados() }),
    'GET /api/chats/guardado': (q) => chats.leerGuardado(q.get('archivo')) ?? [404, { error: 'Chat no encontrado.' }],
    'POST /api/chats': async (_q, cuerpo) => {
      const ruta = rutaProyecto(trabajo, cuerpo.proyecto, memoria);
      if (!ruta) return [404, { error: 'Proyecto no encontrado en este equipo.' }];
      return [201, { id: chats.crear(ruta, cuerpo.ia) }];
    },
  };

  const servidor = http.createServer(async (req, res) => {
    try {
      if (!permitido(req.headers.host)) { res.writeHead(421); res.end(); return; }
      const url = new URL(req.url, 'http://localhost');
      const { pathname: p, searchParams: q } = url;
      // Público también por Tailscale (sin passkey): Android lo lee para dejar a la app usar las passkeys del dominio.
      if (p === '/.well-known/assetlinks.json' && req.method === 'GET') { json(res, 200, assetlinks(leerFirma())); return; }
      // Por Tailscale: Origin exacto en toda escritura, /entrar con passkey y sesión obligatoria para lo demás.
      const remota = esRemota(req, dominio);
      let sesion = null;
      if (remota) {
        if (req.method !== 'GET' && req.method !== 'HEAD' && !escrituraPermitida(req, permitido, origenRemoto)) { json(res, 403, { error: 'Petición no permitida.' }); return; }
        if (await entrada(req, res, p)) return;
        sesion = sesiones.leer(req);
        if (!sesion) {
          if (p.startsWith('/api/')) json(res, 401, { error: 'Hace falta entrar con tu passkey.' });
          else html(res, 303, '', { Location: '/entrar' });
          return;
        }
      } else if (acceso) {
        if (p === '/entrar') { await entrar(req, res, url, acceso, permitido); return; }
        if (!acceso.autenticado(req)) {
          if (p.startsWith('/api/')) json(res, 401, { error: 'Hace falta el código de acceso.' });
          else html(res, 303, '', { Location: '/entrar' });
          return;
        }
      }
      if (!p.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
        servirEstatico(res, p);
        return;
      }
      if (!remota && req.method !== 'GET' && !escrituraPermitida(req, permitido)) { json(res, 403, { error: 'Petición no permitida.' }); return; }

      const soloCodigo = Boolean(acceso) && !remota && !hostPermitido(req.headers.host);
      const ctx = { remota, sesion, soloCodigo, quien: quienEs(req, sesion) };
      if (await rutasRemoto(req, res, p, ctx)) return;
      if (await rutasHerramientas(req, res, p, ctx)) return;
      if (await rutasProyectos(req, res, p, ctx)) return;
      if (await rutasEquipo(req, res, p, ctx)) return;
      if (await rutasVoz(req, res, p, ctx)) return;

      // Chats abiertos: /api/chats/:id/(eventos|mensajes|cerrar)
      const m = p.match(/^\/api\/chats\/([0-9a-f-]{36})\/(eventos|mensajes|cerrar)$/);
      if (m) {
        const [, id, accion] = m;
        if (accion === 'eventos' && req.method === 'GET') { if (!chats.suscribir(id, res)) json(res, 404, { error: 'Ese chat ya no está abierto.' }); return; }
        if (accion === 'mensajes' && req.method === 'POST') {
          const { texto, voz } = await leerCuerpo(req);
          if (typeof texto !== 'string' || !texto.trim()) { json(res, 400, { error: 'Mensaje vacío.' }); return; }
          chats.enviar(id, texto, { voz: voz === true });
          json(res, 202, { ok: true });
          return;
        }
        if (accion === 'cerrar' && req.method === 'POST') { const r = await chats.cerrar(id); json(res, r ? 200 : 404, r ?? { error: 'Ese chat ya no está abierto.' }); return; }
        json(res, 405, { error: 'Método no permitido.' });
        return;
      }

      const manejador = rutas[`${req.method} ${p}`];
      if (!manejador) { json(res, 404, { error: 'No existe.' }); return; }
      const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : null;
      const r = await manejador(q, cuerpo ?? {}, { quien: quienEs(req, sesion) });
      if (Array.isArray(r) && typeof r[0] === 'number') json(res, r[0], r[1]);
      else json(res, 200, r);
    } catch (e) {
      if (!res.headersSent) json(res, e.codigo ?? 500, { error: e.codigo ? e.message : 'Error interno del panel.' });
      if (!e.codigo) console.error(`[panel] ${e.stack ?? e.message}`);
    }
  });
  servidor.on('close', () => { clearInterval(latido); voz.parar(); });
  return servidor;
}

/** Primer mensaje de una sesión reabierta tras reiniciar el contenedor. */
export const AVISO_REANUDAR = 'Nullraptor se ha reiniciado (actualización o parada) y esta sesión se ha reabierto con la conversación anterior. '
  + 'Si estabas a mitad de un trabajo: revisa la lista de tareas de este proyecto (tu lista y las de Ruflo), di en una línea dónde lo dejaste y sigue con la siguiente pendiente. '
  + 'Si no había nada en curso, no hagas nada y espera instrucciones.';

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  const trabajo = path.resolve(process.env.TRABAJO_DIR ?? path.join(AQUI, '..', '..'));
  const memoria = process.env.BOVEDA_DIR ? path.resolve(process.env.BOVEDA_DIR) : null;
  const host = process.env.PANEL_HOST ?? '127.0.0.1';
  const puerto = Number(process.env.PANEL_PUERTO ?? 4321);
  // Modo red: el código se guarda en el volumen (en Docker, HOME=/estado/home) y no se escribe en el registro.
  const red = process.env.PANEL_RED === '1';
  const archivoCodigo = process.env.PANEL_CODIGO ?? path.join(os.homedir(), '.nullraptor', 'panel-codigo');
  // Tailscale: el dominio lo pasa el lanzador (tailscale serve). El código del lanzador solo sirve para la primera passkey.
  const dominio = process.env.PANEL_DOMINIO?.trim().toLowerCase() || null;
  if (dominio && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(dominio)) { console.error(`PANEL_DOMINIO no válido: ${dominio}`); process.exit(1); }
  const codigo = red || dominio ? leerOCrearCodigo(archivoCodigo) : null;
  const acceso = red ? crearAcceso(codigo) : null;
  const passkeys = dominio ? new Passkeys({ archivo: path.join(os.homedir(), '.nullraptor', 'passkeys.json'), dominio, origenesApp: origenesApp(leerFirma()) }) : null;
  const registro = new Registro({ carpeta: path.join(trabajo, 'registros'), avisoUrl: process.env.AVISO_NTFY || null });
  // MCP de las sesiones (con las herramientas aprobadas), rehecho al abrir cada una y al aprobar o desactivar.
  const prepararMcp = () => escribirMcp({ agente: path.resolve(AQUI, '..'), env: process.env, memoria, trabajo });
  // Las sesiones remotas mueren con el panel, pero al pararlo (actualización, docker stop) se apunta cuáles había
  // para reabrirlas al volver con su conversación: así el trabajo a medias no se queda olvidado.
  const remoto = new Remoto({ trabajo, memoria, registro, prepararMcp });
  const actualizacion = new Actualizacion({ trabajo });
  process.on('exit', () => remoto.cerrarTodas());
  for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(senal, () => {
      try { actualizacion.guardarReanudar(remoto.activas().map((s) => s.proyecto)); } catch (e) { console.warn(`[panel] reanudar: ${e.message}`); }
      remoto.cerrarTodas().then(() => process.exit(0));
    });
  }
  for (const proyecto of actualizacion.tomarReanudar()) {
    try { remoto.abrir(proyecto, { quien: 'reanudada tras reiniciar', continuar: true, aviso: AVISO_REANUDAR }); console.error(`[panel] Sesión reanudada en ${proyecto}.`); }
    catch (e) { console.warn(`[panel] No se pudo reanudar la sesión de ${proyecto}: ${e.message}`); }
  }
  const codigoLanzador = codigo ? crearAcceso(codigo).probar : undefined;
  crearServidor({ trabajo, memoria, acceso, registro, remoto, dominio, passkeys, codigoLanzador, actualizacion, prepararMcp }).listen(puerto, host, () => {
    console.error(`Panel de Nullraptor en http://localhost:${puerto}  (Ctrl+C para cerrar)`);
    if (red) console.error(`Modo red: abierto a la red de casa con código de acceso (en ${archivoCodigo}).`);
    if (dominio) console.error(`Tailscale: https://${dominio} con passkey${passkeys.hay() ? '' : ` (primera passkey con el código de ${archivoCodigo})`}.`);
    if (!memoria) console.warn('Aviso: sin BOVEDA_DIR, el panel no muestra la bóveda.');
  });
}
