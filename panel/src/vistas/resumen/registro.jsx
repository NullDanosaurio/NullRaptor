// Registro de tarjetas del Resumen: id → { ancho en columnas (1 o 2), visible(datos), Componente }. No sabe de
// botones ni de la rejilla, para poder reutilizarlo (p. ej. en un catálogo de tarjetas).
import { Avance, Avisos, BuscarBoveda, CambiosBoveda, Chats, Cifras, GastoIA, McpRecomendados, Proyectos, TareasIA } from './tarjetas.jsx';

const siempre = () => true;

export const WIDGETS = {
  cifras: { ancho: 2, visible: siempre, Componente: ({ datos: d }) => <Cifras proyectos={d.proyectos} boveda={d.boveda} chats={d.chats} guardados={d.guardados} /> },
  avance: { ancho: 2, visible: (d) => Boolean(d.tareas?.avance), Componente: ({ datos: d }) => <Avance avance={d.tareas?.avance} /> },
  avisos: { ancho: 2, visible: (d) => Boolean(d.tareas?.avisos), Componente: ({ datos: d }) => <Avisos avisos={d.tareas?.avisos} /> },
  tareas: { ancho: 2, visible: (d) => Boolean(d.tareas), Componente: ({ datos: d }) => <TareasIA tareas={d.tareas} /> },
  proyectos: { ancho: 2, visible: siempre, Componente: ({ datos: d }) => <Proyectos proyectos={d.proyectos} /> },
  mcp: { ancho: 2, visible: (d) => Boolean(d.mcp?.hoy?.length), Componente: ({ datos: d }) => <McpRecomendados mcp={d.mcp} /> },
  gasto: { ancho: 1, visible: siempre, Componente: () => <GastoIA /> },
  'boveda-buscar': { ancho: 1, visible: siempre, Componente: () => <BuscarBoveda /> },
  'boveda-cambios': { ancho: 1, visible: siempre, Componente: ({ datos: d }) => <CambiosBoveda boveda={d.boveda} /> },
  chats: { ancho: 1, visible: siempre, Componente: ({ datos: d }) => <Chats chats={d.chats} guardados={d.guardados} /> },
};

export const ORDEN_POR_DEFECTO = ['cifras', 'avance', 'avisos', 'tareas', 'proyectos', 'mcp', 'gasto', 'boveda-buscar', 'boveda-cambios', 'chats'];

/** Ids de las tarjetas que tienen datos que enseñar. */
export const visibles = (orden, datos) => orden.filter((id) => WIDGETS[id]?.visible(datos));
