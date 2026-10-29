// Bóveda (vault de Obsidian) para el panel: árbol, notas, búsqueda y cambios recientes. Solo lectura.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OCULTOS = new Set(['.git', '.obsidian', '.trash', 'node_modules']);
const MAX_NOTA = 2 * 1024 * 1024;
const MAX_ARCHIVOS = 5000;

/** Ruta relativa → absoluta dentro de la raíz; null si se sale (.., absolutas, enlaces fuera) o no es .md. */
export function rutaSegura(raiz, relativa) {
  if (typeof relativa !== 'string' || !relativa || relativa.includes('\0')) return null;
  const base = fs.realpathSync(raiz);
  const destino = path.resolve(base, relativa);
  if (!destino.startsWith(base + path.sep) || !destino.toLowerCase().endsWith('.md')) return null;
  if (destino.split(path.sep).some((p) => OCULTOS.has(p))) return null;
  let real;
  try { real = fs.realpathSync(destino); } catch { return null; }
  return real.startsWith(base + path.sep) ? real : null;
}

/** Todas las notas .md, con su carpeta. Orden: carpetas primero, luego alfabético. */
export function listarNotas(raiz) {
  const notas = [];
  const recorrer = (dir) => {
    let entradas;
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entradas) {
      if (notas.length >= MAX_ARCHIVOS || e.name.startsWith('.') || OCULTOS.has(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        const st = fs.statSync(p);
        notas.push({ ruta: path.relative(raiz, p).split(path.sep).join('/'), nombre: e.name.replace(/\.md$/i, ''), cambiada: st.mtimeMs, bytes: st.size });
      }
    }
  };
  recorrer(raiz);
  return notas.sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));
}

/** Separa el frontmatter YAML sencillo (clave: valor) del cuerpo. */
export function frontmatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { datos: {}, cuerpo: texto };
  const datos = {};
  for (const linea of m[1].split(/\r?\n/)) {
    const kv = linea.match(/^([\w-]+):\s*(.*)$/);
    if (kv) datos[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return { datos, cuerpo: texto.slice(m[0].length) };
}

/** Enlaces [[nota]] o [[nota|alias]] de un texto. */
export function enlaces(texto) {
  return [...new Set([...texto.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim()))];
}

export function leerNota(raiz, relativa) {
  const abs = rutaSegura(raiz, relativa);
  if (!abs) return null;
  const st = fs.statSync(abs);
  if (st.size > MAX_NOTA) return { ruta: relativa, nombre: path.basename(abs, '.md'), datos: {}, cambiada: st.mtimeMs, enlaces: [], retroenlaces: [], demasiadoGrande: true };
  const texto = fs.readFileSync(abs, 'utf8');
  const { datos, cuerpo } = frontmatter(texto);
  const nombre = path.basename(abs).replace(/\.md$/i, '');
  // Retroenlaces: notas que enlazan a esta.
  const retro = listarNotas(raiz).filter((n) => n.ruta !== relativa).filter((n) => {
    try { return enlaces(fs.readFileSync(path.join(raiz, n.ruta), 'utf8')).some((e) => e.toLowerCase() === nombre.toLowerCase()); } catch { return false; }
  }).map((n) => n.ruta);
  return { ruta: relativa, nombre, datos, cuerpo, cambiada: st.mtimeMs, enlaces: enlaces(cuerpo), retroenlaces: retro };
}

/** Búsqueda simple sin mayúsculas ni acentos, en nombre y contenido; con fragmento. */
export function buscar(raiz, consulta, limite = 30) {
  const normal = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const q = normal(String(consulta ?? '').trim()).slice(0, 200);
  if (q.length < 2) return [];
  const resultados = [];
  for (const n of listarNotas(raiz)) {
    let texto = '';
    try { texto = frontmatter(fs.readFileSync(path.join(raiz, n.ruta), 'utf8')).cuerpo; } catch { continue; }
    const plano = normal(texto);
    const enNombre = normal(n.nombre).includes(q);
    const i = plano.indexOf(q);
    if (!enNombre && i < 0) continue;
    const desde = Math.max(0, i - 60);
    const fragmento = i < 0 ? '' : `${desde ? '…' : ''}${texto.slice(desde, i + q.length + 80).replace(/\s+/g, ' ').trim()}…`;
    resultados.push({ ...n, fragmento, puntos: (enNombre ? 10 : 0) + (plano.split(q).length - 1) });
  }
  return resultados.sort((a, b) => b.puntos - a.puntos).slice(0, limite);
}

/** Últimos commits de la bóveda (rama del agente), con los archivos tocados. */
export function cambiosRecientes(raiz, limite = 12) {
  try {
    const salida = execFileSync('git', ['log', `-n${limite}`, '--name-only', '--format=%x1e%h%x1f%an%x1f%aI%x1f%s'], {
      cwd: raiz, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return salida.split('\x1e').filter((b) => b.trim()).map((b) => {
      const [cabecera, ...archivos] = b.trim().split('\n');
      const [hash, autor, fecha, asunto] = cabecera.split('\x1f');
      return { hash, autor, fecha, asunto, archivos: archivos.filter(Boolean) };
    });
  } catch {
    return [];
  }
}

export function estadoGit(raiz) {
  const git = (args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    const rama = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    let delante = 0;
    let detras = 0;
    try { [delante, detras] = git(['rev-list', '--left-right', '--count', 'HEAD...@{u}']).split(/\s+/).map(Number); } catch {}
    const sucios = git(['status', '--porcelain']).split('\n').filter(Boolean).length;
    return { rama, delante, detras, sucios };
  } catch {
    return null;
  }
}
