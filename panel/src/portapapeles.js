// Copiar al portapapeles desde el panel (terminal, bloques de código y mensajes del chat). Devuelve si funcionó, para
// que quien llama avise «Copiado» o «No se pudo copiar»; nunca lanza.
// Con contexto seguro (localhost o https por Tailscale) se usa navigator.clipboard. Sin él (http por la red de casa)
// la API no existe y se copia con un textarea temporal y document.execCommand('copy'), que solo funciona dentro de
// un clic o una pulsación de tecla.

/** Copia `texto`. true si quedó en el portapapeles. */
export async function alPortapapeles(texto) {
  const t = String(texto ?? '');
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
  }
  return typeof document === 'undefined' ? false : copiarConTextarea(t, document);
}

/**
 * Alternativa sin navigator.clipboard: textarea de solo lectura (iOS no saca el teclado), fuera de la vista y con
 * letra de 16 px (iOS no hace zoom). select() más setSelectionRange(0, largo), porque en iOS select() solo no
 * selecciona nada. Devuelve el foco a donde estaba (la terminal, por ejemplo).
 */
export function copiarConTextarea(texto, doc) {
  const antes = doc.activeElement;
  const area = doc.createElement('textarea');
  area.value = texto;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  area.setAttribute('tabindex', '-1');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '-9999px', width: '1px', height: '1px', opacity: '0', fontSize: '16px', pointerEvents: 'none' });
  doc.body.append(area);
  let ok = false;
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, texto.length);
    ok = doc.execCommand('copy') === true;
  } catch { ok = false; } finally {
    area.remove();
    if (antes && antes !== doc.body && typeof antes.focus === 'function') antes.focus({ preventScroll: true });
  }
  return ok;
}
