// Tipos de widget para el servidor: JSON puro, sin React. Los ids son los de las tarjetas del Resumen
// (lib/diseno.mjs). El componente de cada tipo vive en el front; aquí solo lo que el servidor valida.
import { IDS } from './diseno.mjs';

/** Anchas del Resumen actual (ocupan una fila entera); el resto, media fila. */
const ANCHAS = new Set(['cifras', 'avance', 'avisos', 'tareas', 'proyectos', 'mcp']);
const TITULOS = {
  cifras: 'Cifras', avance: 'Avance por proyecto', avisos: 'Avisos', tareas: 'Tareas de la IA', proyectos: 'Proyectos',
  mcp: 'MCP recomendados', gasto: 'Gasto de la IA', 'boveda-buscar': 'Buscar en la bóveda', 'boveda-cambios': 'Cambios de la bóveda', chats: 'Chats',
};

/** id → { titulo, ajustes (esquema plano, vacío), fuentes (ranuras), permisos (vacío = solo datos), tamano }. */
export const TIPOS = Object.fromEntries(IDS.map((id) => [id, {
  titulo: TITULOS[id], ajustes: {}, fuentes: [], permisos: [], tamano: { peso_h: ANCHAS.has(id) ? 12 : 6, peso_v: 4 },
}]));

export const esTipo = (tipo) => typeof tipo === 'string' && Object.hasOwn(TIPOS, tipo);
