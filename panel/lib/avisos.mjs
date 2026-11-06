// Avisos del Resumen a partir de las sesiones y las tareas de cada proyecto.
import { avanceTareas, estadoProyecto } from './tareas-ruflo.mjs';

/** Avisos por proyecto, ordenados desde la actividad más reciente. */
export function calcularAvisos(sesiones, tareas, { max = 10 } = {}) {
  const avisos = [];
  for (const proyecto of Object.keys(sesiones)) {
    if (!Object.hasOwn(sesiones, proyecto)) continue;
    const sesion = sesiones[proyecto];
    const propias = tareas.filter((t) => t.proyecto === proyecto);
    // Una clave interna evita las propiedades heredadas en avanceTareas.
    const avances = avanceTareas(propias.map((t) => ({ ...t, proyecto: 'actual' })));
    const avance = Object.hasOwn(avances, 'actual') ? avances.actual : { enCurso: 0 };
    const estado = estadoProyecto(avance, sesion);
    const tarea = propias.find((t) => t.estado === 'en curso');
    const detalle = tarea ? ` · ${tarea.texto}` : '';
    let tipo;
    let texto;
    if (sesion.parada) {
      tipo = 'parada';
      texto = `Sin actividad hace ${Math.round(sesion.hace / 60)} min${detalle}`;
    } else if (sesion.evento === 'Notification') {
      tipo = 'espera';
      texto = `Claude espera tu respuesta${detalle}`;
    } else if (sesion.evento === 'SessionEnd' ||
        (sesion.evento === 'Stop' && estado !== 'trabajando')) {
      tipo = 'terminada';
      texto = sesion.evento === 'SessionEnd'
        ? 'Sesión terminada' : 'Turno terminado, esperando indicaciones';
    } else {
      continue;
    }
    if (texto.length > 120) texto = `${texto.slice(0, 119)}…`;
    avisos.push({ proyecto, tipo, texto, en: sesion.en });
  }
  return avisos.sort((a, b) => Date.parse(b.en) - Date.parse(a.en)).slice(0, max);
}
