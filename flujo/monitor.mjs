// Monitor en vivo del flujo automático (solo lectura).
// Uso: node flujo/monitor.mjs [--una-vez] [--raiz=RUTA]   (por defecto FLUJO_PROYECTO o el directorio actual)
// Teclas: q salir · r refrescar. Respeta NO_COLOR.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FASES, NOMBRE_FASE, datosEjecucion as datosEjecucionDe, fasesDeIntento, leerJson, leerTareas as leerTareasDe,
  procesoVivo, ramasPendientes as ramasPendientesDe,
} from './lib/estado.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const RAIZ = path.resolve(typeof args.raiz === 'string' ? args.raiz : (process.env.FLUJO_PROYECTO ?? process.cwd()));
const RUNS = path.join(RAIZ, '.runs');
const REFRESCO_MS = 2000;

// --- Presentación ---------------------------------------------------------------
const COLOR = !process.env.NO_COLOR;
const estilo = (c) => (t) => (COLOR ? `\x1b[${c}m${t}\x1b[0m` : String(t));
const verde = estilo('32');
const rojo = estilo('31');
const amarillo = estilo('33');
const cian = estilo('36');
const tenue = estilo('2');
const negrita = estilo('1');
const sinAnsi = (t) => t.replace(/\x1b\[[0-9;]*m/g, '');
const ancho = (t) => [...sinAnsi(t)].length;
function ajustar(texto, columnas) {
  if (ancho(texto) <= columnas) return texto + ' '.repeat(columnas - ancho(texto));
  const plano = [...sinAnsi(texto)];
  return `${plano.slice(0, columnas - 1).join('')}…`;
}

export function duracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

// --- Datos (flujo/lib/estado.mjs) ------------------------------------------------
export { FASES, fasesDeIntento };
const leerTareas = () => leerTareasDe(RAIZ);
const datosEjecucion = (id) => datosEjecucionDe(RAIZ, id);
const ramasPendientes = () => ramasPendientesDe(RAIZ);

// --- Vista ------------------------------------------------------------------------
const ICONO = { integrado: verde('✔'), 'en curso': amarillo('⏳'), rechazado: rojo('✖'), error: rojo('✖'), cancelado: amarillo('■'), interrumpido: amarillo('!') };

export function construirVista({ columnas = 80, ahora = Date.now() } = {}) {
  const tareas = leerTareas();
  const estado = leerJson(path.join(RUNS, 'estado-tareas.json'), {});
  const bloqueo = leerJson(path.join(RUNS, 'flujo.lock'), null);
  const vivo = bloqueo && procesoVivo(bloqueo.pid);
  const interior = Math.max(40, Math.min(columnas, 100) - 4);
  const lineas = [];
  const fila = (t = '') => lineas.push(`${tenue('│')} ${ajustar(t, interior)} ${tenue('│')}`);

  const integradas = tareas.filter((t) => estado[t.id]?.estado === 'integrado').length;
  const cabecera = vivo
    ? amarillo(`${bloqueo.id === 'plan' ? 'plan' : bloqueo.id} en curso`)
    : bloqueo ? rojo('ejecución interrumpida: usa «flujo recuperar»') : tenue('sin ejecución');
  const reloj = new Date(ahora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const titulo = ` ${path.basename(RAIZ)} · ${sinAnsi(cabecera)} · ${integradas}/${tareas.length} `;
  const relleno = Math.max(1, interior + 2 - ancho(titulo) - reloj.length - 3);
  lineas.push(tenue(`╭─${negrita(titulo).replace(sinAnsi(cabecera), cabecera)}${'─'.repeat(relleno)} ${reloj} ─╮`));

  let detalle = null;
  for (const t of tareas) {
    const e = estado[t.id];
    const tipo = e?.estado ?? 'pendiente';
    const icono = ICONO[tipo] ?? tenue('·');
    const ej = e?.ejecucion ? datosEjecucion(e.ejecucion) : null;
    const max = ej?.resumen?.maxIntentos ?? 3;
    let derecha = '';
    if (tipo === 'en curso' && ej) {
      derecha = amarillo(`intento ${ej.n}/${max}`);
      detalle = ej;
    } else if (ej?.resumen?.fin) {
      const total = Date.parse(ej.resumen.fin) - Date.parse(ej.resumen.inicio);
      derecha = `${ej.resumen.intentos.length} intento${ej.resumen.intentos.length === 1 ? '' : 's'}  ${duracion(total)}`;
      if (tipo !== 'integrado') derecha = rojo(`${tipo} · `) + derecha;
    } else if (t.dependencias.length) {
      derecha = tenue(`← ${t.dependencias.join(', ')}`);
    }
    const izquierda = `${icono} ${negrita(t.id)} ${t.titulo}`;
    const espacio = interior - ancho(derecha) - 1;
    fila(`${ajustar(izquierda, Math.max(10, espacio))} ${derecha}`);
    if (tipo === 'en curso' && ej) {
      const pasos = ej.fases.map((f) => {
        const nombre = NOMBRE_FASE[f.fase];
        if (f.estado === 'ok') return verde(`${nombre} ✔`);
        if (f.estado === 'fallo') return rojo(`${nombre} ✖`);
        if (f.fase === ej.actual) return amarillo(`${nombre} …`);
        return tenue(nombre);
      });
      fila(`   ${cian('▸')} ${pasos.join(tenue(' · '))}`);
      fila(`     ${tenue(`fase actual: ${ej.actual ? NOMBRE_FASE[ej.actual] : '—'} · ${duracion(Math.max(0, ahora - ej.desde))} en esta fase`)}`);
    }
  }
  if (tareas.length === 0) fila(tenue('No hay tareas en tareas/.'));
  lineas.push(tenue(`╰${'─'.repeat(interior + 2)}╯`));

  const ramas = ramasPendientes();
  if (detalle?.ultimo) {
    const etiqueta = detalle.enVivo ? 'En vivo:' : 'Último registro:';
    lineas.push(` ${tenue(etiqueta)} ${ajustar(detalle.ultimo, interior - etiqueta.length)}`);
  }
  if (ramas) lineas.push(` ${amarillo(`${ramas} rama${ramas === 1 ? '' : 's'} flujo/… sin integrar`)} ${tenue('(intentos rechazados conservados)')}`);
  lineas.push(` ${tenue('q salir · r refrescar · registros en .runs/')}`);
  return lineas;
}

// --- Bucle ------------------------------------------------------------------------
function pintar() {
  const vista = construirVista({ columnas: process.stdout.columns ?? 80 });
  process.stdout.write(`\x1b[H\x1b[2J${vista.join('\n')}\n`);
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  if (args['una-vez'] || !process.stdout.isTTY) {
    process.stdout.write(`${construirVista({ columnas: process.stdout.columns ?? 100 }).join('\n')}\n`);
  } else {
    const salir = () => {
      process.stdout.write('\x1b[?25h\x1b[?1049l');
      process.exit(0);
    };
    process.stdout.write('\x1b[?1049h\x1b[?25l');
    pintar();
    const reloj = setInterval(pintar, REFRESCO_MS);
    process.stdout.on('resize', pintar);
    process.on('SIGINT', salir);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', (tecla) => {
        const k = tecla.toString();
        if (k === 'q' || k === '\u0003') {
          clearInterval(reloj);
          salir();
        } else if (k === 'r') pintar();
      });
    }
  }
}
