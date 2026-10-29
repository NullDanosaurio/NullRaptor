// Coordinador del flujo automático. Trabaja sobre el proyecto de FLUJO_PROYECTO o del directorio actual.
//
//   node flujo/flujo.mjs tarea tareas/F1-01-....md   ejecuta una tarea
//   node flujo/flujo.mjs plan                        ejecuta las pendientes en orden de dependencias
//   node flujo/flujo.mjs plan --turno-codex          Codex avanza sin revisión: deja ramas «listo para revisar»
//   node flujo/flujo.mjs revisar [Id]                turno de Claude: revisa e integra lo que dejó Codex
//   node flujo/flujo.mjs estado                      muestra el estado de cada tarea
//   node flujo/flujo.mjs cancelar                    pide detener la ejecución en curso
//   node flujo/flujo.mjs recuperar                   limpia ejecuciones interrumpidas
//
// Opciones: --intentos=N (1-5, por defecto 3), --sin-e2e, --turno-codex,
//           --simulador=<nombre> (tests/flujo/simuladores; sustituye a Codex para verificar controles)
import { adquirirBloqueo, git, leerBloqueo, liberarBloqueo, paso, procesoVivo, solicitarCancelacion } from './lib/comun.mjs';
import { ejecutarTarea, recuperarInterrumpidas } from './lib/ejecucion.mjs';
import { leerEstado, leerTarea, listarTareas, ordenar } from './lib/tareas.mjs';

const [comando = 'ayuda', ...resto] = process.argv.slice(2);
const opciones = Object.fromEntries(resto.filter((a) => a.startsWith('--')).map((a) => {
  const [clave, valor] = a.slice(2).split('=');
  return [clave, valor ?? true];
}));
const posicionales = resto.filter((a) => !a.startsWith('--'));
const maxIntentos = Math.min(5, Math.max(1, Number(opciones.intentos ?? 3)));
const ajustes = { maxIntentos, simulador: opciones.simulador ?? null, e2e: !opciones['sin-e2e'], sinRevision: !!opciones['turno-codex'] };
const LISTO = 'listo para revisar';

function conBloqueo(id, fn) {
  const huerfano = adquirirBloqueo(id, process.argv.slice(2).join(' '));
  if (huerfano) {
    paso(`Bloqueo huérfano de ${huerfano.id} (proceso terminado): recupero sus worktrees.`);
    const recuperadas = recuperarInterrumpidas();
    if (recuperadas.length) paso(`Recuperadas: ${recuperadas.join(', ')} (su trabajo queda en ramas flujo/…)`);
  }
  return Promise.resolve().then(fn).finally(liberarBloqueo);
}

async function ejecutarPlan() {
  const tareas = ordenar(listarTareas());
  const estado = leerEstado();
  const fallidas = new Set();
  const informe = [];
  for (const tarea of tareas) {
    if (estado[tarea.id]?.estado === 'integrado' || estado[tarea.id]?.estado === LISTO) continue; // lo listo espera a «revisar»
    const bloqueadaPor = tarea.dependencias.filter((d) => fallidas.has(d) || (estado[d]?.estado !== 'integrado' && !informe.some((i) => i.id === d && i.resultado === 'integrado')));
    if (bloqueadaPor.length) {
      fallidas.add(tarea.id);
      informe.push({ id: tarea.id, resultado: `bloqueada por ${bloqueadaPor.join(', ')}` });
      continue;
    }
    const resumen = await ejecutarTarea(tarea, ajustes);
    informe.push({ id: tarea.id, resultado: resumen.resultado });
    if (resumen.resultado === 'cancelado') break;
    if (resumen.resultado !== 'integrado') fallidas.add(tarea.id);
  }
  paso('Resultado del plan:');
  const bien = (r) => r === 'integrado' || r === LISTO;
  for (const { id, resultado } of informe) paso(`  ${bien(resultado) ? '✔' : '✖'} ${id}: ${resultado}`);
  if (informe.length === 0) paso('  No hay tareas pendientes.');
  return informe.every((i) => bien(i.resultado)) ? 0 : 1;
}

/** Turno de Claude: cada tarea «listo para revisar» pasa por alcance, comprobaciones (sobre el main actual) y revisión. */
async function revisarListas() {
  const estado = leerEstado();
  const listas = ordenar(listarTareas()).filter((t) => estado[t.id]?.estado === LISTO && (!posicionales[0] || t.id === posicionales[0]));
  if (listas.length === 0) { paso('No hay trabajo de Codex pendiente de revisar.'); return 0; }
  const informe = [];
  for (const tarea of listas) {
    const rama = `flujo/${estado[tarea.id].ejecucion}`;
    const resumen = await ejecutarTarea(tarea, { ...ajustes, sinRevision: false, maxIntentos: 1, desdeRama: rama });
    if (resumen.resultado === 'integrado') git(['branch', '-D', rama]); // su contenido ya está en main
    informe.push({ id: tarea.id, resultado: resumen.resultado });
    if (resumen.resultado === 'cancelado') break;
  }
  for (const { id, resultado } of informe) paso(`  ${resultado === 'integrado' ? '✔' : '✖'} ${id}: ${resultado}`);
  return informe.every((i) => i.resultado === 'integrado') ? 0 : 1;
}

function mostrarEstado() {
  const estado = leerEstado();
  const bloqueo = leerBloqueo();
  if (bloqueo && procesoVivo(bloqueo.pid)) paso(`En curso: ${bloqueo.id} (proceso ${bloqueo.pid}, desde ${bloqueo.inicio})`);
  else if (bloqueo) paso(`Ejecución interrumpida: ${bloqueo.id} (proceso ${bloqueo.pid} terminado). Usa «recuperar».`);
  for (const tarea of ordenar(listarTareas())) {
    const e = estado[tarea.id];
    const deps = tarea.dependencias.length ? ` ← ${tarea.dependencias.join(', ')}` : '';
    paso(`${(e?.estado ?? 'pendiente').padEnd(13)} ${tarea.id}  ${tarea.titulo}${deps}${e?.commit ? `  [${e.commit.slice(0, 7)}]` : ''}`);
  }
  return 0;
}

async function principal() {
  switch (comando) {
    case 'tarea': {
      if (!posicionales[0]) throw new Error('Indica la tarea: node flujo/flujo.mjs tarea tareas/<archivo>.md');
      const tarea = leerTarea(posicionales[0]);
      return conBloqueo(tarea.id, async () => ((await ejecutarTarea(tarea, ajustes)).resultado === 'integrado' ? 0 : 1));
    }
    case 'revisar':
      return conBloqueo('revisar', revisarListas);
    case 'plan':
      return conBloqueo('plan', ejecutarPlan);
    case 'estado':
      return mostrarEstado();
    case 'cancelar':
      solicitarCancelacion();
      paso('Cancelación solicitada: la ejecución en curso se detendrá y conservará su trabajo en una rama.');
      return 0;
    case 'recuperar':
      return conBloqueo('recuperar', () => {
        const recuperadas = recuperarInterrumpidas();
        paso(recuperadas.length ? `Recuperadas: ${recuperadas.join(', ')}` : 'No había ejecuciones interrumpidas.');
        return 0;
      });
    default:
      console.log('Uso: FLUJO_PROYECTO=<carpeta> node flujo/flujo.mjs <tarea RUTA | plan [--turno-codex] | revisar [Id] | estado | cancelar | recuperar> [--intentos=N] [--sin-e2e] [--simulador=NOMBRE]');
      return comando === 'ayuda' ? 0 : 2;
  }
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (error) => {
    console.error(`[flujo] ${error.message}`);
    process.exitCode = 1;
  },
);
