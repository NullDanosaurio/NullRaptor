// Archivos que se pueden adjuntar a la terminal desde el panel: se decide por la extensión del nombre y se comprueba
// el contenido (primeros bytes o UTF-8 válido); el tipo que diga el navegador no cuenta.
export const MAX_ADJUNTO = 20 * 1024 * 1024;

const FIRMAS = {
  png: [0x89, 0x50, 0x4e, 0x47], jpg: [0xff, 0xd8, 0xff], gif: [0x47, 0x49, 0x46, 0x38], webp: [0x52, 0x49, 0x46, 0x46],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  zip: [0x50, 0x4b, 0x03, 0x04], // docx, xlsx, pptx, odt… son zip
};
const IMAGENES = { png: 'png', jpg: 'jpg', jpeg: 'jpg', gif: 'gif', webp: 'webp' };
const OFFICE = ['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'];
export const TEXTO = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'ndjson', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'xml',
  'html', 'htm', 'css', 'scss', 'svg', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'py', 'rb', 'php', 'java',
  'kt', 'swift', 'go', 'rs', 'c', 'h', 'cpp', 'hpp', 'cs', 'sh', 'bash', 'ps1', 'bat', 'sql', 'log', 'ipynb', 'tex', 'srt',
  'vtt', 'diff', 'patch',
];
/** Extensiones admitidas, para el selector de archivos del navegador. */
export const EXTENSIONES = [...Object.keys(IMAGENES), 'pdf', ...OFFICE, ...TEXTO];

const empieza = (datos, firma) => firma.every((b, i) => datos[i] === b);
function esTexto(datos) {
  if (datos.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(datos); return true; } catch { return false; }
}

/** Nombre sin rutas ni caracteres raros (lo lee Claude en el mensaje): letras, números, punto, guion y guion bajo. */
function sanear(base) {
  const limpio = base.normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  return limpio || 'archivo';
}

/**
 * Comprueba un adjunto. Devuelve { clase: 'imagen' | 'pdf' | 'office' | 'texto', nombre } con el nombre de archivo
 * seguro, o null si no se admite (extensión desconocida, contenido que no casa, vacío o demasiado grande).
 */
export function clasificar(nombre, datos) {
  if (!Buffer.isBuffer(datos) || !datos.length || datos.length > MAX_ADJUNTO) return null;
  const solo = String(nombre ?? '').split(/[\\/]/).pop();
  const punto = solo.lastIndexOf('.');
  if (punto < 0) return null;
  const ext = solo.slice(punto + 1).toLowerCase();
  const base = sanear(solo.slice(0, punto));
  let clase = null;
  if (IMAGENES[ext]) clase = empieza(datos, FIRMAS[IMAGENES[ext]]) ? 'imagen' : null;
  else if (ext === 'pdf') clase = empieza(datos, FIRMAS.pdf) ? 'pdf' : null;
  else if (OFFICE.includes(ext)) clase = empieza(datos, FIRMAS.zip) ? 'office' : null;
  else if (TEXTO.includes(ext)) clase = esTexto(datos) ? 'texto' : null;
  return clase && { clase, nombre: `${base}.${IMAGENES[ext] ?? ext}` };
}
