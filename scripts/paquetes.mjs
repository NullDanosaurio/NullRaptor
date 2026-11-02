// Paquetes del sistema (apt) que sobreviven a las actualizaciones: `paquetes instalar <nombre…>` los instala con sudo
// y los apunta en /estado/sistema/apt-paquetes.txt (volumen). La imagen nueva no los trae, así que al arrancar
// preparar.mjs lanza `paquetes restaurar` en segundo plano, que instala los que falten (registro en apt.log).
//   paquetes instalar <p…> · quitar <p…> · lista · restaurar
// En la imagen, /usr/local/bin/paquetes llama a este script.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SISTEMA = process.env.NULLRAPTOR_SISTEMA ?? '/estado/sistema';
const NOMBRE = /^[a-z0-9][a-z0-9+.-]{0,99}(:[a-z0-9]+)?$/; // nombre de paquete Debian (con arquitectura opcional)

export function validar(nombres) {
  if (!nombres.length) throw new Error('Falta el nombre de algún paquete.');
  for (const n of nombres) if (!NOMBRE.test(n)) throw new Error(`Nombre de paquete no válido: «${n}».`);
  return nombres;
}

export function leerLista(dir = SISTEMA) {
  try {
    return fs.readFileSync(path.join(dir, 'apt-paquetes.txt'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && NOMBRE.test(l));
  } catch { return []; }
}

export function guardarLista(lista, dir = SISTEMA) {
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, 'apt-paquetes.txt');
  const texto = `# Paquetes apt instalados por la IA; se reinstalan solos tras cada actualización (scripts/paquetes.mjs).\n${[...new Set(lista)].sort().join('\n')}\n`;
  fs.writeFileSync(`${archivo}.tmp`, texto);
  fs.renameSync(`${archivo}.tmp`, archivo);
}

const correr = (orden, args) => spawnSync(orden, args, { stdio: 'inherit', env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } }).status ?? 1;
const instalado = (p) => spawnSync('dpkg-query', ['-W', '-f=${Status}', p], { encoding: 'utf8' }).stdout?.includes('install ok installed');

/** apt-get update solo si las listas faltan o tienen más de una hora (la imagen las borra). */
function actualizarListas(ejecutar) {
  const listas = '/var/lib/apt/lists';
  let reciente = false;
  try { reciente = fs.readdirSync(listas).some((n) => n.endsWith('_Packages') && Date.now() - fs.statSync(path.join(listas, n)).mtimeMs < 3600_000); } catch { /* sin listas */ }
  return reciente ? 0 : ejecutar('sudo', ['apt-get', 'update', '-q']);
}

export function ejecutarOrden(orden, nombres, { dir = SISTEMA, ejecutar = correr, comprobar = instalado } = {}) {
  if (orden === 'lista') return { codigo: 0, salida: leerLista(dir).join('\n') || '(ninguno)' };
  if (orden === 'instalar') {
    validar(nombres);
    if (actualizarListas(ejecutar)) return { codigo: 1, salida: 'Falló apt-get update.' };
    if (ejecutar('sudo', ['apt-get', 'install', '-y', '--no-install-recommends', ...nombres])) return { codigo: 1, salida: 'Falló la instalación: no se apunta nada.' };
    guardarLista([...leerLista(dir), ...nombres], dir);
    return { codigo: 0, salida: `Instalado y apuntado (se reinstalará tras cada actualización): ${nombres.join(', ')}` };
  }
  if (orden === 'quitar') {
    validar(nombres);
    guardarLista(leerLista(dir).filter((p) => !nombres.includes(p)), dir);
    ejecutar('sudo', ['apt-get', 'remove', '-y', ...nombres]);
    return { codigo: 0, salida: `Quitado de la lista: ${nombres.join(', ')}` };
  }
  if (orden === 'restaurar') {
    const faltan = leerLista(dir).filter((p) => !comprobar(p));
    if (!faltan.length) return { codigo: 0, salida: 'Nada que restaurar.' };
    if (actualizarListas(ejecutar)) return { codigo: 1, salida: 'Falló apt-get update.' };
    // Uno a uno: si alguno ya no existe, los demás se instalan igual.
    const fallidos = faltan.filter((p) => ejecutar('sudo', ['apt-get', 'install', '-y', '--no-install-recommends', p]));
    return { codigo: fallidos.length ? 1 : 0, salida: fallidos.length ? `No se pudieron restaurar: ${fallidos.join(', ')}` : `Restaurados: ${faltan.join(', ')}` };
  }
  throw new Error('Uso: paquetes instalar <p…> | quitar <p…> | lista | restaurar');
}

const esPrincipal = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esPrincipal) {
  try {
    const r = ejecutarOrden(process.argv[2], process.argv.slice(3));
    console.log(r.salida);
    process.exit(r.codigo);
  } catch (e) { console.error(e.message); process.exit(1); }
}
