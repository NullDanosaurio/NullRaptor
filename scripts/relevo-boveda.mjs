// Comprobación de la bóveda tras un relevo: Codex solo debería tocar Proyectos/<Proyecto>.md y la bóveda debe seguir
// en la rama «agente». El sandbox no puede limitar un archivo suelto, así que se vigila aquí y se avisa en el resumen.
import { execFileSync } from 'node:child_process';

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] });

/** Rama y cambios (git status) de la bóveda, o null si no es un repositorio. */
export function instantaneaBoveda(memoria) {
  if (!memoria) return null;
  try {
    return { rama: git(memoria, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(),
      cambios: new Set(git(memoria, ['status', '--porcelain=v1', '-uall']).split('\n').filter(Boolean)) };
  } catch { return null; }
}

/** Avisos por lo que cambió entre dos instantáneas fuera de la nota del proyecto y por la rama. */
export function avisosBoveda(antes, despues, proyecto) {
  if (!antes || !despues) return [];
  const avisos = [];
  if (despues.rama !== 'agente') avisos.push(`La bóveda está en la rama «${despues.rama}», no en «agente».`);
  const nota = `Proyectos/${proyecto}.md`;
  const fuera = [...despues.cambios].filter((l) => !antes.cambios.has(l) && l.slice(3).replace(/^"|"$/g, '') !== nota);
  if (fuera.length) avisos.push(`Archivos de la bóveda tocados fuera de ${nota}: ${fuera.map((l) => l.slice(3)).join(', ')}.`);
  return avisos;
}
