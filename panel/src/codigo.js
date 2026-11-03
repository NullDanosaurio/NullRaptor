// Bloques de código del Markdown (react-markdown entrega el árbol hast del <pre>): el texto exacto para copiarlo
// (sin las ``` ni la etiqueta del lenguaje) y el lenguaje para enseñarlo en la cabecera del bloque.

const textoDe = (nodo) => (nodo?.type === 'text' ? nodo.value : (nodo?.children ?? []).map(textoDe).join(''));
const codigoDe = (pre) => pre?.children?.find((h) => h.type === 'element' && h.tagName === 'code') ?? pre;

/** Texto del bloque tal cual. Markdown añade un salto de línea final que no es del código: se quita (solo ese). */
export function textoDeCodigo(pre) {
  return textoDe(codigoDe(pre)).replace(/\n$/, '');
}

/** «js», «python»… de la clase language-*, o null. */
export function lenguajeDe(pre) {
  const clases = codigoDe(pre)?.properties?.className;
  const lista = Array.isArray(clases) ? clases : String(clases ?? '').split(/\s+/);
  return lista.map(String).find((c) => c.startsWith('language-'))?.slice('language-'.length) || null;
}
