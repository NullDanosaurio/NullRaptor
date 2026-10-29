// Menú de proyectos: los conocidos salen de la memoria (notas Proyectos/*.md con `repo:` en el frontmatter).
// Si el elegido no está en el equipo se clona; «nuevo» crea un repositorio privado en GITHUB_ORG y su nota.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { guardarEstado, leerEstado } from './mcp.mjs';

export function proyectosConocidos(memoria) {
  const dir = path.join(memoria, 'Proyectos');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).flatMap((f) => {
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(dir, f), 'utf8'))?.[1] ?? '';
    const repo = /^repo:\s*(\S+)\s*$/m.exec(fm)?.[1];
    return repo ? [{ nombre: f.slice(0, -3), repo }] : [];
  });
}

const NOMBRE_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

async function crearRepositorio(nombre, env) {
  const { GITHUB_TOKEN: token, GITHUB_ORG: org } = env;
  if (!token) throw new Error('Para crear proyectos hace falta GITHUB_TOKEN en el cofre.');
  const api = env.GITHUB_API ?? 'https://api.github.com';
  // Con GITHUB_ORG, en la organización; sin ella, en la cuenta personal dueña del token.
  const destino = org ? `/orgs/${encodeURIComponent(org)}/repos` : '/user/repos';
  const r = await fetch(`${api}${destino}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ name: nombre, private: true, auto_init: true }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`GitHub rechazó crear ${org ?? 'tu cuenta'}/${nombre}: ${r.status} ${cuerpo.message ?? ''}`);
  return cuerpo.clone_url;
}

// Nota del proyecto nuevo desde la plantilla de la memoria; se guarda en la rama del agente.
function registrarEnMemoria(memoria, nombre, repo, git) {
  const hoy = new Date().toISOString().slice(0, 10);
  const plantilla = path.join(memoria, 'Plantillas', 'Proyecto.md');
  const base = fs.existsSync(plantilla) ? fs.readFileSync(plantilla, 'utf8') : '---\ntipo: proyecto\nactualizado: {{date}}\n---\n# {{title}}\n';
  const nota = base.replaceAll('{{title}}', nombre).replaceAll('{{date}}', hoy).replace(/^---\r?\n/, `---\nrepo: ${repo}\n`);
  fs.writeFileSync(path.join(memoria, 'Proyectos', `${nombre}.md`), nota);
  git(['add', path.join('Proyectos', `${nombre}.md`)], memoria);
  git(['commit', '-m', `Proyecto nuevo: ${nombre}`], memoria);
  try { git(['push', '-u', 'origin', 'HEAD'], memoria); } catch { console.warn('Aviso: la nota se guardó, pero no se pudo subir la rama de la memoria.'); }
}

// Recomendaciones MCP del día: ver detalles e instalar solo si Daniel escribe «instalar».
async function revisarMcp(rl, memoria, elegidos, git) {
  const instalados = new Set(leerEstado(memoria).instalados.map((i) => i.id));
  elegidos.forEach((e, n) => console.error(`  ${n + 1}. ${e.titulo} (${e.categoria})${instalados.has(e.id) ? ' [instalado]' : ''}\n     ${e.porque}`));
  const e = elegidos[Number((await rl.question('¿Cuál quieres ver? (número o Intro para volver): ')).trim()) - 1];
  if (!e) return;
  const i = e.instalacion;
  console.error([
    `\n${e.titulo} — ${e.id}`, e.descripcion,
    `Instalación: ${i.tipo === 'npm' ? `npx ${i.paquete}@${i.version} (código de terceros que se ejecuta en el contenedor)` : `${i.url} (servicio remoto: los datos que le pases salen del equipo)`}`,
    `Repositorio: ${e.repo ?? 'no indicado'}`,
    `Variables: ${i.variables.map((v) => `${v.nombre}${v.secreta ? ' (secreta)' : ''}${v.obligatoria ? ' (obligatoria)' : ''}`).join(', ') || 'ninguna'}`,
    `Riesgos: ${e.riesgos}`,
    'Se ejecutará con los permisos del agente (sus archivos y su red). Nunca recibe GITHUB_*, CLAUDE_* ni AGENTE_*.',
  ].join('\n'));
  if (instalados.has(e.id)) { console.error('Ya está instalado.'); return; }
  if ((await rl.question('Escribe «instalar» para autorizarlo (cualquier otra cosa cancela): ')).trim().toLowerCase() !== 'instalar') {
    console.error('Cancelado: no se ha instalado nada.');
    return;
  }
  const estado = leerEstado(memoria);
  estado.instalados.push({ id: e.id, instalacion: i, repo: e.repo, autorizado: new Date().toISOString() });
  guardarEstado(memoria, estado);
  git(['add', 'MCP'], memoria);
  git(['commit', '-m', `MCP instalado con autorización: ${e.id}`], memoria);
  try { git(['push', '-u', 'origin', 'HEAD'], memoria); } catch { console.warn('Aviso: guardado en local; no se pudo subir la memoria.'); }
  const secretas = i.variables.filter((v) => v.obligatoria).map((v) => v.nombre);
  console.error(`Instalado. Se activará la próxima vez que abras un proyecto.${secretas.length ? ` Antes añade al cofre: ${secretas.join(', ')}.` : ''}`);
}

// Devuelve la carpeta del proyecto elegido (clonado si hacía falta) o null para salir.
export async function elegirProyecto({ memoria, trabajo, env, git, clonar }) {
  const lista = proyectosConocidos(memoria);
  const destino = (nombre) => path.join(trabajo, 'proyectos', nombre);
  console.error('\nProyectos conocidos:');
  lista.forEach((p, i) => console.error(`  ${i + 1}. ${p.nombre}${fs.existsSync(destino(p.nombre)) ? '' : '  (se descargará)'}`));
  const { hoy: mcpHoy = [], ultimaExploracion } = leerEstado(memoria);
  const cuando = ultimaExploracion === new Date().toISOString().slice(0, 10) ? 'hoy' : `el ${ultimaExploracion}`;
  console.error(`  n. Proyecto nuevo${mcpHoy.length ? `\n  m. Servidores MCP recomendados ${cuando} (${mcpHoy.length})` : ''}\n  s. Salir`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const r = (await rl.question('Elige: ')).trim().toLowerCase();
      if (r === 's') return null;
      if (r === 'm' && mcpHoy.length) { await revisarMcp(rl, memoria, mcpHoy, git); continue; }
      if (r === 'n') {
        const nombre = (await rl.question('Nombre del repositorio: ')).trim();
        if (!NOMBRE_VALIDO.test(nombre)) { console.error('Nombre no válido (letras, números, . _ -).'); continue; }
        if (lista.some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) { console.error('Ya existe.'); continue; }
        const url = await crearRepositorio(nombre, env);
        registrarEnMemoria(memoria, nombre, url, git);
        clonar(url, destino(nombre));
        return destino(nombre);
      }
      const p = lista[Number(r) - 1];
      if (p) { clonar(p.repo, destino(p.nombre)); return destino(p.nombre); }
      console.error('Opción no válida.');
    }
  } finally { rl.close(); }
}
