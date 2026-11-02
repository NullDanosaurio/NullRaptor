// OSC 52: así copia Claude Code al portapapeles cuando no tiene uno propio (en el contenedor no lo hay). Llega
// `ESC ] 52 ; <destino> ; <base64> BEL`; xterm.js nos pasa `<destino>;<base64>`.

/** Texto a copiar de un OSC 52, o null si es una consulta (`?`), está vacío o no es base64 válido. */
export function textoOsc52(datos) {
  const i = String(datos).indexOf(';');
  const b64 = i < 0 ? '' : String(datos).slice(i + 1).replace(/\s/g, '');
  if (!b64 || b64 === '?') return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
