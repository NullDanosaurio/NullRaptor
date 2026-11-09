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

/** Deja `dir` como una carpeta real sin nada que no sea un archivo regular (borra enlaces y subcarpetas). */
export function prepararCarpetaCodex(dir) {
  try { if (!fs.lstatSync(dir).isDirectory()) fs.rmSync(dir, { force: true }); } catch { /* no existe */ }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  for (const n of fs.readdirSync(dir)) if (!esRegular(path.join(dir, n))) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
}

/** Si `ruta` existe y no es un archivo regular (p. ej. un enlace), la borra sin seguirla. */
export function quitarSiNoRegular(ruta) {
  if (existeAlgo(ruta) && !esRegular(ruta)) fs.rmSync(ruta, { recursive: true, force: true });
}
