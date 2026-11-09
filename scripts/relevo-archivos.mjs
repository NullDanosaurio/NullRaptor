// Lectura y limpieza segura de lo que escribe Codex en .relevo/<Proyecto>/: nunca se sigue un enlace simbólico
// (Codex puede crear uno dentro del sandbox) y solo cuentan los archivos regulares.
import fs from 'node:fs';
import path from 'node:path';

/** Nombre de proyecto aceptable: letras, números, espacios, «_», «.» y «-»; sin «..», barras, saltos de línea ni comillas. */
export const nombreProyectoValido = (n) => typeof n === 'string' && !n.includes('..') && /^[\p{L}\p{N}_][\p{L}\p{N}_ .-]{0,79}$/u.test(n);

/** true solo si la ruta existe y es un archivo regular (sin seguir enlaces). */
export const esRegular = (ruta) => { try { return fs.lstatSync(ruta).isFile(); } catch { return false; } };
export const existeAlgo = (ruta) => { try { fs.lstatSync(ruta); return true; } catch { return false; } };

/** Lee un archivo regular sin seguir enlaces (O_NOFOLLOW) y con tope de bytes; '' si no se puede. */
export function leerSeguro(ruta, max = 1 << 20) {
  let fd;
  try {
    fd = fs.openSync(ruta, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    if (!fs.fstatSync(fd).isFile()) return '';
    const b = Buffer.alloc(max);
    return b.toString('utf8', 0, fs.readSync(fd, b, 0, max, 0));
  } catch { return ''; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ya cerrado */ } }
}

/** Da permisos de escritura a todo lo que cuelga de `ruta` sin seguir enlaces (Codex puede dejar carpetas 555). */
function abrirPermisos(ruta) {
  let st;
  try { st = fs.lstatSync(ruta); } catch { return; }
  if (st.isSymbolicLink()) return;
  try { fs.chmodSync(ruta, st.isDirectory() ? 0o700 : 0o600); } catch { /* ajeno: lo intentará rmSync */ }
  if (st.isDirectory()) for (const n of fs.readdirSync(ruta)) abrirPermisos(path.join(ruta, n));
}

/** Deja `dir` como una carpeta real sin nada que no sea un archivo regular (borra enlaces y subcarpetas). Si no se puede
 * limpiar, aparta lo viejo a `.viejo-<nombre>-<n>` y sigue con una carpeta nueva. Devuelve un aviso o null; nunca lanza. */
export function prepararCarpetaCodex(dir) {
  let aviso = null;
  try {
    abrirPermisos(dir);
    try { if (!fs.lstatSync(dir).isDirectory()) fs.rmSync(dir, { force: true }); } catch { /* no existe */ }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);
    for (const n of fs.readdirSync(dir)) if (!esRegular(path.join(dir, n))) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  } catch (e) {
    try {
      const viejo = path.join(path.dirname(dir), `.viejo-${path.basename(dir)}-${Date.now()}`);
      fs.renameSync(dir, viejo);
      fs.mkdirSync(dir, { mode: 0o700 });
      aviso = `No se pudo limpiar ${dir} (${e.code ?? e.message}); lo anterior se apartó en ${viejo}.`;
    } catch (e2) { aviso = `No se pudo preparar ${dir}: ${e2.message}.`; }
  }
  return aviso;
}

/** Si `ruta` existe y no es un archivo regular (p. ej. un enlace), la borra sin seguirla. */
export function quitarSiNoRegular(ruta) {
  if (existeAlgo(ruta) && !esRegular(ruta)) fs.rmSync(ruta, { recursive: true, force: true });
}

// El sandbox de Codex deja carpetas vacías (marcadores del perfil) en la raíz del proyecto y en .relevo/<P>/.
const MARCADORES = ['.agents', '.aws', '.codex', '.git'];

/** Marcadores que ya existen en `dir` (para no borrar luego algo que estaba antes). */
export const marcadoresPresentes = (dir) => new Set(MARCADORES.filter((n) => existeAlgo(path.join(dir, n))));

/** Borra de `dir` solo los marcadores que no existían antes, son carpetas reales y están VACÍOS (rmdir, nunca recursivo). */
export function limpiarMarcadores(dir, antes) {
  for (const n of MARCADORES) {
    if (antes.has(n)) continue;
    try { if (fs.lstatSync(path.join(dir, n)).isDirectory()) fs.rmdirSync(path.join(dir, n)); } catch { /* no existe o no está vacío */ }
  }
}
