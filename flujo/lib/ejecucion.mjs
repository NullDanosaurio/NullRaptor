// Ejecución de una tarea: worktree aislado → implementador → alcance → comprobaciones
// → revisión → reintentos → integración (avance rápido, sin push) → registros.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  Cancelado, ErrorInfra, RAIZ, RUNS, WORKTREES, comprobarCancelacion, git, marcaTiempo, paso, registrarEnRuflo, sha256,
} from './comun.mjs';
import { implementar, revisar } from './agentes.mjs';
import { comprobar, problemasDeCodificacion } from './comprobaciones.mjs';
import { guardarEstado, leerEstado, listarTareas } from './tareas.mjs';

/** Pruebas de aceptación de otras tareas aún no integradas (no pueden pasar todavía). */
function pruebasPendientes(tarea) {
  const estado = leerEstado();
  return listarTareas()
    .filter((t) => t.id !== tarea.id && estado[t.id]?.estado !== 'integrado')
    .flatMap((t) => t.pruebas)
    .filter((p) => !tarea.pruebas.includes(p));
}

// Archivos cambiados o nuevos en el worktree (rutas con «/»).
export function cambiosEn(wt) {
  const partes = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'], wt).split('\0');
  const cambios = [];
  for (let i = 0; i < partes.length; i++) {
    const entrada = partes[i];
    if (!entrada) continue;
    cambios.push(entrada.slice(3));
    if (entrada[0] === 'R' || entrada[0] === 'C') i++;
  }
  // El enlace a node_modules lo crea el flujo. En Linux es un symlink que git ve como archivo
  // (la regla «node_modules/» de .gitignore solo cubre carpetas), así que nunca cuenta como cambio.
  return cambios.filter((c) => c !== 'node_modules');
}

function restaurar(wt, archivos) {
  for (const archivo of archivos) {
    const seguido = git(['ls-files', '--', archivo], wt) !== '';
    if (seguido) git(['restore', '--source=HEAD', '--staged', '--worktree', '--', archivo], wt);
    else fs.rmSync(path.join(wt, archivo), { force: true, recursive: true });
  }
}

/** Cierra un worktree. Si hay trabajo sin integrar, lo conserva como commit en su rama. */
export function cerrarWorktree(wt, rama, permitidos, motivo, integrado) {
  if (!fs.existsSync(wt)) return;
  let conservarRama = !integrado;
  if (!integrado) {
    const pendientes = cambiosEn(wt).filter((c) => permitidos.includes(c));
    if (pendientes.length) {
      git(['add', '--', ...pendientes], wt);
      git(['commit', '-m', `flujo (sin integrar): ${motivo}`], wt);
    } else if (git(['rev-list', '--count', `HEAD..${rama}`]) === '0') {
      conservarRama = false; // la rama no tiene trabajo propio
    }
  }
  const enlace = path.join(wt, 'node_modules');
  try {
    if (fs.lstatSync(enlace).isSymbolicLink()) fs.unlinkSync(enlace);
  } catch {
    // no había enlace
  }
  if (fs.existsSync(enlace)) throw new ErrorInfra(`No se pudo quitar ${enlace}; worktree conservado`);
  try {
    git(['worktree', 'remove', '--force', wt]);
  } catch (error) {
    // Windows: rutas de más de 260 caracteres (caché de Next.js). Sin enlaces
    // dentro (comprobado arriba), se borra la carpeta con el prefijo \\?\.
    if (process.platform !== 'win32') throw error;
    spawnSync('cmd', ['/c', 'rd', '/s', '/q', `\\\\?\\${wt}`], { windowsHide: true });
    if (fs.existsSync(wt)) throw error;
    git(['worktree', 'prune']);
  }
  if (integrado) git(['branch', '-d', rama]);
  else if (!conservarRama) git(['branch', '-D', rama]);
}

/** Recupera worktrees de una ejecución interrumpida (proceso muerto). */
export function recuperarInterrumpidas() {
  if (!fs.existsSync(WORKTREES)) return [];
  const recuperadas = [];
  for (const id of fs.readdirSync(WORKTREES)) {
    const wt = path.join(WORKTREES, id);
    const resumenArchivo = path.join(RUNS, id, 'resumen.json');
    const resumen = fs.existsSync(resumenArchivo) ? JSON.parse(fs.readFileSync(resumenArchivo, 'utf8')) : null;
    try {
      cerrarWorktree(wt, `flujo/${id}`, resumen?.permitidos ?? [], `ejecución ${id} interrumpida`, false);
      if (resumen && resumen.resultado === 'en curso') {
        resumen.resultado = 'interrumpido';
        resumen.fin = new Date().toISOString();
        fs.writeFileSync(resumenArchivo, `${JSON.stringify(resumen, null, 2)}\n`);
        guardarEstado(resumen.tareaId, { estado: 'interrumpido', ejecucion: id });
      }
      recuperadas.push(id);
    } catch (error) {
      paso(`Aviso: no se pudo recuperar ${id}: ${error.message}`);
    }
  }
  git(['worktree', 'prune']);
  return recuperadas;
}

function comprobarPrecondiciones(tarea) {
  if (git(['status', '--porcelain'])) throw new Error('Hay cambios sin commit en la rama principal. Haz commit o descártalos antes de lanzar el flujo.');
  const estado = leerEstado();
  const pendientes = tarea.dependencias.filter((d) => estado[d]?.estado !== 'integrado');
  if (pendientes.length) throw new Error(`${tarea.id}: dependencias sin integrar: ${pendientes.join(', ')}`);
  for (const prueba of tarea.pruebas) {
    if (git(['ls-files', '--', prueba]) === '') throw new Error(`${tarea.id}: la prueba de aceptación ${prueba} no está versionada`);
  }
}

/**
 * Ejecuta una tarea completa. Devuelve el resumen (resultado: integrado |
 * rechazado | no integrado | cancelado | error).
 */
// sinRevision: turno de Codex (si pasan las comprobaciones, queda «listo para revisar» en su rama, sin tocar main).
// desdeRama: turno de revisión de Claude sobre el trabajo que Codex dejó en esa rama.
export async function ejecutarTarea(tarea, { maxIntentos = 3, simulador = null, e2e = true, sinRevision = false, desdeRama = null } = {}) {
  comprobarPrecondiciones(tarea);
  const base = git(['rev-parse', 'HEAD']);
  const id = `${marcaTiempo()}-${tarea.id}`.replace(/[^\w.-]/g, '_');
  const dir = path.join(RUNS, id);
  fs.mkdirSync(dir, { recursive: true });
  const wt = path.join(WORKTREES, id);
  const rama = `flujo/${id}`;
  const resumen = {
    id, tareaId: tarea.id, tarea: tarea.ruta, titulo: tarea.titulo, base, permitidos: tarea.permitidos,
    pruebas: tarea.pruebas, maxIntentos, implementador: desdeRama ? `codex (${desdeRama})` : simulador ? `simulado:${simulador}` : 'codex',
    inicio: new Date().toISOString(), intentos: [], resultado: 'en curso',
  };
  const guardarResumen = () => fs.writeFileSync(path.join(dir, 'resumen.json'), `${JSON.stringify(resumen, null, 2)}\n`);
  guardarResumen();
  guardarEstado(tarea.id, { estado: 'en curso', ejecucion: id });
  let integrado = false;
  // El diagnóstico de una revisión anterior (p. ej. rechazo en el turno de Claude) llega al siguiente turno de Codex.
  let diagnostico = desdeRama ? null : (leerEstado()[tarea.id]?.diagnostico ?? null);

  try {
    paso(`Ejecución ${id}: ${tarea.titulo}`);
    git(['worktree', 'add', '-b', rama, wt, base]);
    fs.symlinkSync(path.join(RAIZ, 'node_modules'), path.join(wt, 'node_modules'), 'junction');

    let aprobado = false;
    let listo = false;
    for (let n = 1; n <= maxIntentos && !aprobado; n++) {
      comprobarCancelacion();
      const intento = { n, inicio: new Date().toISOString() };
      resumen.intentos.push(intento);
      paso(`Intento ${n}/${maxIntentos}: implementa ${resumen.implementador}`);
      const impl = await implementar({ wt, dir, n, tarea, diagnostico, simulador, desdeRama });
      intento.implementador = { agente: impl.agente, modelo: impl.modelo ?? null, ms: impl.ms };
      comprobarCancelacion();

      const cambios = cambiosEn(wt);
      const fuera = cambios.filter((c) => !tarea.permitidos.includes(c));
      const dentro = cambios.filter((c) => tarea.permitidos.includes(c));
      intento.cambios = cambios;
      if (fuera.length) {
        restaurar(wt, fuera);
        intento.fallo = 'alcance';
        diagnostico = `Modificaste archivos fuera del alcance (se han revertido): ${fuera.join(', ')}. Solo puedes tocar: ${tarea.permitidos.join(', ')}.`;
        paso(`✖ Fuera de alcance: ${fuera.join(', ')}`);
        guardarResumen();
        continue;
      }
      if (dentro.length === 0) {
        intento.fallo = 'sin cambios';
        diagnostico = 'No modificaste ningún archivo permitido.';
        paso('✖ El implementador no cambió ningún archivo permitido');
        guardarResumen();
        continue;
      }

      const codificacion = problemasDeCodificacion(wt, dentro);
      if (codificacion.length) {
        intento.fallo = 'codificacion';
        diagnostico = `Archivos con codificación incorrecta (guárdalos como UTF-8 sin convertir el texto):\n- ${codificacion.slice(0, 20).join('\n- ')}`;
        paso(`✖ Codificación: ${codificacion.length} problemas`);
        guardarResumen();
        continue;
      }

      paso('Comprobaciones: integridad, typecheck, pruebas, build y e2e');
      const comprobacion = await comprobar({ wt, dir, n, base, e2e, excluir: pruebasPendientes(tarea) });
      intento.comprobaciones = comprobacion.resultado;
      // Lo que cambie el build (p. ej. tsconfig.json) no es trabajo del implementador: se revierte.
      const ajenos = cambiosEn(wt).filter((c) => !tarea.permitidos.includes(c));
      if (ajenos.length) restaurar(wt, ajenos);
      comprobarCancelacion();
      if (!comprobacion.ok) {
        intento.fallo = 'comprobaciones';
        diagnostico = comprobacion.diagnostico;
        paso(`✖ ${comprobacion.diagnostico.split('\n')[0]}`);
        guardarResumen();
        continue;
      }

      if (sinRevision) {
        listo = true;
        break;
      }
      paso('Revisión de Claude en solo lectura');
      const existen = dentro.filter((f) => fs.existsSync(path.join(wt, f))); // los borrados no se pueden marcar con -N
      if (existen.length) git(['add', '-N', '--', ...existen], wt);
      const diff = git(['diff', 'HEAD', '--', ...dentro], wt); // contra HEAD: incluye borrados ya preparados
      const veredicto = await revisar({ wt, dir, n, tarea, diff, comprobaciones: comprobacion.superadas });
      comprobarCancelacion();
      intento.revision = veredicto;
      if (!veredicto.approved) {
        intento.fallo = 'revision';
        diagnostico = `La revisión de Claude rechazó el cambio:\n- ${veredicto.issues.join('\n- ')}`;
        paso(`✖ Revisión rechazada (${veredicto.issues.length} problemas)`);
        guardarResumen();
        continue;
      }
      aprobado = true;
      paso('✔ Comprobaciones y revisión superadas');
    }

    if (listo) {
      resumen.resultado = 'listo para revisar';
      diagnostico = null;
      paso(`✔ Comprobaciones superadas. Queda en la rama ${rama} para el turno de revisión (npm run flujo -- revisar).`);
      return resumen;
    }
    if (!aprobado) {
      resumen.resultado = 'rechazado';
      paso(`✖ Sin éxito tras ${maxIntentos} intentos. El último intento queda en la rama ${rama}.`);
      return resumen;
    }
    if (git(['rev-parse', 'HEAD']) !== base || git(['status', '--porcelain'])) {
      resumen.resultado = 'no integrado: la rama principal cambió durante la ejecución';
      paso(`✖ ${resumen.resultado}. El cambio queda en la rama ${rama}.`);
      return resumen;
    }
    const finales = cambiosEn(wt).filter((c) => tarea.permitidos.includes(c));
    resumen.hashes = Object.fromEntries(finales.map((f) => [f, fs.existsSync(path.join(wt, f)) ? sha256(path.join(wt, f)) : 'borrado']));
    git(['add', '-A', '--', ...finales], wt);
    git(['commit', '-m', `flujo: ${tarea.titulo}`, '-m', [
      `Tarea: ${tarea.id} (${tarea.ruta})`, `Ejecución: ${id}`, `Intentos: ${resumen.intentos.length}`,
      `Implementador: ${resumen.implementador}`, `Comprobaciones: ${resumen.intentos.at(-1).comprobaciones ? Object.keys(resumen.intentos.at(-1).comprobaciones).join(', ') : ''}`,
      'Revisión: aprobada por Claude',
    ].join('\n')], wt);
    resumen.commit = git(['rev-parse', 'HEAD'], wt);
    git(['merge', '--ff-only', rama]);
    integrado = true;
    resumen.resultado = 'integrado';
    paso(`✔ Integrado: ${resumen.commit.slice(0, 7)} (sin push)`);
    return resumen;
  } catch (error) {
    resumen.resultado = error instanceof Cancelado ? 'cancelado' : `error: ${error.message}`;
    paso(`✖ ${resumen.resultado}`);
    return resumen;
  } finally {
    resumen.fin = new Date().toISOString();
    try {
      cerrarWorktree(wt, rama, tarea.permitidos, `${tarea.id} (${resumen.resultado})`, integrado);
    } catch (error) {
      paso(`Aviso al cerrar el worktree: ${error.message}`);
    }
    guardarResumen();
    const estado = resumen.resultado === 'integrado' ? 'integrado' : resumen.resultado.split(':')[0];
    guardarEstado(tarea.id, { estado, ejecucion: id, commit: resumen.commit ?? null, diagnostico: integrado ? null : diagnostico });
    registrarEnRuflo('flujo', id, {
      tarea: tarea.id, resultado: resumen.resultado, intentos: resumen.intentos.length,
      implementador: resumen.implementador, commit: resumen.commit ?? null, fin: resumen.fin,
    });
    registrarEnRuflo('tareas', tarea.id, { estado, ejecucion: id, commit: resumen.commit ?? null });
    paso(`Registros en .runs/${id}/`);
  }
}
