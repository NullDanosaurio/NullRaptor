// Proyectos desde el panel (lo mismo que el menú de la terminal, sin bloquear el servidor):
//  - descargar uno conocido por la bóveda (nota Proyectos/<P>.md con `repo:`) que aún no está en el equipo;
//  - clonar uno por su URL (https) y apuntarlo en la bóveda;
//  - crear uno nuevo: repositorio privado en GitHub (GITHUB_TOKEN del cofre), su nota y su copia en el equipo.
// git se autentica con las variables que pone scripts/preparar.mjs (el token no toca el disco ni los argumentos).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AGENTE_REPO, carpetaAgente, crearRepositorio, NOMBRE_VALIDO, opcionesDelMenu, registrarEnMemoria } from '../../scripts/menu.mjs';
import { BOVEDA, carpetaProyectos, NULLRAPTOR } from './trabajo.mjs';

const fallo = (mensaje, codigo) => Object.assign(new Error(mensaje), { codigo });
const MAX_MS = 10 * 60_000;

/** git asíncrono; el error lleva la última línea de su salida de errores (sin el token, que no pasa por ahí). */
export function gitAsincrono(env) {
  return (args, cwd) => new Promise((resolve, reject) => {
    execFile('git', args, { cwd, env, encoding: 'utf8', timeout: MAX_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (e, salida, errores) => {
      if (e) reject(new Error(String(errores || e.message).trim().split('\n').at(-1)));
      else resolve(salida.trim());
    });
  });
}

/** URL de un repositorio que se puede clonar: https, sin usuario ni contraseña dentro. */
export function urlValida(url) {
  try {
    const u = new URL(String(url ?? '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && u.pathname.length > 1;
  } catch { return false; }
}

/** Nombre de carpeta a partir de la URL: https://github.com/a/MiRepo.git → MiRepo. */
export const nombreDeUrl = (url) => decodeURIComponent(new URL(url).pathname.replace(/\/+$/, '').split('/').pop() ?? '').replace(/\.git$/i, '');

export class Proyectos {
  constructor({ trabajo, memoria = null, env = process.env, git = gitAsincrono(env), crearRepo = (nombre) => crearRepositorio(nombre, env) }) {
    Object.assign(this, { trabajo, memoria, env, git, crearRepo });
    this.enCurso = new Set(); // nombres con una descarga o creación en marcha
  }

  #destino(nombre) { return nombre === NULLRAPTOR ? carpetaAgente(this.trabajo) : path.join(carpetaProyectos(this.trabajo), nombre); }

  #libre(nombre) {
    if (!NOMBRE_VALIDO.test(nombre ?? '') || nombre === BOVEDA) throw fallo('Nombre no válido: letras, números, punto, guion y guion bajo.', 400);
    if (this.enCurso.has(nombre.toLowerCase())) throw fallo(`Ya se está preparando ${nombre}.`, 409);
    if (fs.existsSync(this.#destino(nombre))) throw fallo(`${nombre} ya está en este equipo.`, 409);
  }

  async #clonar(nombre, url) {
    const destino = this.#destino(nombre);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    try { await this.git(['clone', '-c', 'core.longpaths=true', url, destino]); } catch (e) {
      fs.rmSync(destino, { recursive: true, force: true }); // sin medias copias
      throw fallo(`No se pudo clonar ${url}: ${e.message}`, 502);
    }
  }

  async #conBloqueo(nombre, fn) {
    this.#libre(nombre);
    this.enCurso.add(nombre.toLowerCase());
    try { return await fn(); } finally { this.enCurso.delete(nombre.toLowerCase()); }
  }

  /** Descarga un proyecto que la bóveda conoce y aún no está en el equipo. */
  async descargar(nombre) {
    const conocido = this.memoria ? opcionesDelMenu(this.memoria, this.env.AGENTE_REPO).find((p) => p.nombre === nombre && p.repo) : null;
    const repo = conocido?.repo ?? (nombre === NULLRAPTOR ? this.env.AGENTE_REPO ?? AGENTE_REPO : null);
    if (!repo) throw fallo('Ese proyecto no está en la bóveda (falta su nota con «repo:»).', 404);
    return this.#conBloqueo(nombre, async () => { await this.#clonar(nombre, repo); return { nombre }; });
  }

  /** Clona un repositorio por su URL y, si la bóveda no lo conoce, le crea su nota. */
  async clonar(url, nombre = null) {
    if (!urlValida(url)) throw fallo('La URL tiene que empezar por https:// (sin usuario ni contraseña).', 400);
    const n = (nombre ?? '').trim() || nombreDeUrl(url);
    return this.#conBloqueo(n, async () => {
      await this.#clonar(n, url.trim());
      const nota = this.memoria && !fs.existsSync(path.join(this.memoria, 'Proyectos', `${n}.md`));
      const subida = nota ? await registrarEnMemoria(this.memoria, n, url.trim(), this.git) : null;
      return { nombre: n, nota: nota ? `Proyectos/${n}.md` : null, avisos: subida === false ? ['La nota se guardó, pero no se pudo subir la bóveda.'] : [] };
    });
  }

  /** Crea un repositorio privado en GitHub, su nota en la bóveda y lo descarga. */
  async crear(nombre) {
    if (!this.env.GITHUB_TOKEN) throw fallo('Para crear proyectos hace falta GITHUB_TOKEN en el cofre.', 400);
    const conocido = this.memoria && fs.existsSync(path.join(this.memoria, 'Proyectos', `${nombre}.md`));
    if (conocido) throw fallo(`${nombre} ya existe en la bóveda.`, 409);
    return this.#conBloqueo(nombre, async () => {
      let url;
      try { url = await this.crearRepo(nombre); } catch (e) { throw fallo(e.message, 502); }
      const subida = this.memoria ? await registrarEnMemoria(this.memoria, nombre, url, this.git) : null;
      await this.#clonar(nombre, url);
      return { nombre, nota: this.memoria ? `Proyectos/${nombre}.md` : null, avisos: subida === false ? ['La nota se guardó, pero no se pudo subir la bóveda.'] : [] };
    });
  }
}
