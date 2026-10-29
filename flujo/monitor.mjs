// Monitor en vivo del flujo automático (solo lectura).
// Uso: node flujo/monitor.mjs [--una-vez] [--raiz=RUTA]   (por defecto FLUJO_PROYECTO o el directorio actual)
// Teclas: q salir · r refrescar. Respeta NO_COLOR.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// --- Datos ------------------------------------------------------------------------
const leerJson = (ruta, defecto) => {
  try {
    return JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch {
    return defecto;
  }
};

function procesoVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function leerTareas() {
  const dir = path.join(RAIZ, 'tareas');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.md') && !n.startsWith('_') && n.toLowerCase() !== 'readme.md')
    .sort()
    .map((n) => {
      const t = fs.readFileSync(path.join(dir, n), 'utf8');
      const campo = (c) => t.match(new RegExp(`^${c}:\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? '';
      return {
        id: campo('Id') || n.replace(/\.md$/, ''),
        titulo: t.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? n,
        dependencias: campo('Depende de').split(',').map((s) => s.trim()).filter((s) => s && !/^ningun/i.test(s)),
      };
    });
}

export const FASES = ['implementador', 'typecheck', 'pruebas', 'build', 'e2e', 'revision'];
const NOMBRE_FASE = {
  implementador: 'Implementación', typecheck: 'Typecheck', pruebas: 'Unitarias', build: 'Build', e2e: 'E2E', revision: 'Revisión',
};

/** Estado de las fases de un intento a partir de los registros y del resumen. */
export function fasesDeIntento(archivos, n, intento = {}) {
  const hechas = new Set(FASES.filter((f) => archivos.includes(`intento-${n}-${f}.log`)));
  const comprob = intento.comprobaciones ?? {};
  return FASES.map((f) => {
    let estado = 'pendiente';
    if (hechas.has(f)) estado = comprob[f] === false || (f === 'revision' && intento.revision?.approved === false) ? 'fallo' : 'ok';
    return { fase: f, estado };
  });
}

function ultimaLinea(archivo) {
  try {
    const lineas = fs.readFileSync(archivo, 'utf8').split(/\r?\n/).map((l) => l.trim())
      .filter((l) => l && !/^(---|\$ )/.test(l));
    return lineas.at(-1) ?? '';
  } catch {
    return '';
  }
}

function datosEjecucion(id) {
  const dir = path.join(RUNS, id);
  if (!id || !fs.existsSync(dir)) return null;
  const resumen = leerJson(path.join(dir, 'resumen.json'), null);
  const archivos = fs.readdirSync(dir);
  let n = Math.max(1, resumen?.intentos?.length ?? 1);
  let intento = resumen?.intentos?.[n - 1] ?? {};
  // El resumen se guarda al cerrar cada intento: si el último falló y la
  // ejecución sigue abierta, el intento actual es el siguiente.
  if (intento.fallo && !resumen?.fin && n < (resumen?.maxIntentos ?? 3)) {
    n += 1;
    intento = {};
  }
  const fases = fasesDeIntento(archivos, n, intento);
  const actual = fases.find((f) => f.estado === 'pendiente')?.fase ?? null;
  const registros = archivos.filter((a) => a.startsWith(`intento-${n}-`) && a.endsWith('.log'))
    .map((a) => ({ a, t: fs.statSync(path.join(dir, a)).mtimeMs }))
    .sort((x, y) => y.t - x.t);
  // Referencia de tiempo: último registro del intento, su inicio o el último guardado del resumen.
  const desde = registros[0]?.t ?? (intento.inicio ? Date.parse(intento.inicio) : fs.statSync(path.join(dir, 'resumen.json')).mtimeMs);
  // Si el coordinador escribe registro en vivo, se muestra su última línea.
  const vivo = path.join(dir, 'en-curso.log');
  const fuente = fs.existsSync(vivo) ? vivo : registros[0] ? path.join(dir, registros[0].a) : null;
  return { id, resumen, n, fases, actual, desde, enVivo: fuente === vivo, ultimo: fuente ? ultimaLinea(fuente) : '' };
}

function ramasPendientes() {
  try {
    return execFileSync('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads/flujo/'], { cwd: RAIZ, encoding: 'utf8', windowsHide: true })
      .split('\n').filter(Boolean).length;
  } catch {
    return null;
  }
}

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
