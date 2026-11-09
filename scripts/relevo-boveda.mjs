// Comprobación de la bóveda tras un relevo: Codex solo debería tocar Proyectos/<Proyecto>.md y la bóveda debe seguir
// en la rama «agente». El sandbox no puede limitar un archivo suelto, así que se vigila aquí y se avisa.
// Se compara el contenido (hash por archivo), no la línea de «git status»: re-editar un archivo ya modificado también cuenta.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] });

function huella(archivo) {
  try {
    const st = fs.lstatSync(archivo);
    const datos = st.isSymbolicLink() ? Buffer.from(`enlace:${fs.readlinkSync(archivo)}`) : st.isFile() ? fs.readFileSync(archivo) : Buffer.from('no-archivo');
    return createHash('sha256').update(datos).digest('hex');
  } catch { return 'ausente'; }
}

/** Rama y huella de cada archivo que git ve distinto (modificado, nuevo o borrado), o null si no es un repositorio. */
export function instantaneaBoveda(memoria) {
  if (!memoria) return null;
  try {
    const partes = git(memoria, ['status', '--porcelain=v1', '-z', '-uall']).split('\0').filter(Boolean);
    const cambios = new Map();
    for (let i = 0; i < partes.length; i++) {
      const [x, , , ...ruta] = partes[i];
      cambios.set(ruta.join(''), huella(path.join(memoria, ruta.join(''))));
      if (x === 'R' || x === 'C') i += 1; // la ruta original va en la entrada siguiente
    }
    return { rama: git(memoria, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), cambios };
  } catch { return null; }
}

// Los nombres de archivo los elige Codex y acaban en texto que lee Claude: solo caracteres visibles y cortos.
const limpio = (n) => n.replace(/[^\p{L}\p{N} ._/()+,-]/gu, '?').slice(0, 120);

/** Avisos por lo que cambió entre dos instantáneas fuera de la nota del proyecto y por la rama. */
export function avisosBoveda(antes, despues, proyecto) {
  if (!antes || !despues) return [];
  const avisos = [];
  if (despues.rama !== 'agente') avisos.push(`La bóveda está en la rama «${limpio(despues.rama)}», no en «agente».`);
  const nota = `Proyectos/${proyecto}.md`;
  const fuera = [...despues.cambios].filter(([ruta, h]) => ruta !== nota && antes.cambios.get(ruta) !== h).map(([ruta]) => limpio(ruta));
  if (fuera.length) avisos.push(`Archivos de la bóveda tocados fuera de ${limpio(nota)}: ${fuera.slice(0, 20).join(', ')}${fuera.length > 20 ? ` y ${fuera.length - 20} más` : ''}.`);
  return avisos;
}
