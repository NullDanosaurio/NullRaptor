// Capa propia de Codex, persistente y externa a los proyectos. No modifica config.toml ni la autenticación.
import fs from 'node:fs';
import path from 'node:path';
import { argumentosConfig, ajustesMcpCodex, toml } from './codex-mcp.mjs';
import { contenidoRolCodex, instruccionesCodex, adaptarInstruccionesCodex, perfilCodex } from './codex-instrucciones.mjs';

export function guardarPrivado(archivo, texto) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
  const temporal = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, texto, { mode: 0o600 });
  fs.renameSync(temporal, archivo);
}

/** `mcp` es el archivo privado generado por escribirMcp, compartido con Claude. */
export function prepararCodex({ agente, trabajo, mcp, env = {}, perfil = null, registroTareas = null }) {
  const carpeta = path.join(trabajo, '.codex-nullraptor');
  const ajustes = ajustesMcpCodex({ agente, mcp, registroTareas });
  ajustes.project_doc_fallback_filenames = ['CLAUDE.md'];
  ajustes.developer_instructions = instruccionesCodex(agente);
  if (perfil) ajustes.developer_instructions += `\n${perfilCodex(perfil)}\n`;
  ajustes['features.multi_agent'] = true;
  const skills = instalarSkillsCodex({ agente, trabajo, env });
  const roles = instalarRolesCodex({ agente, carpeta });
  ajustes.agents = { max_threads: 3, max_depth: 1, ...roles };
  guardarPrivado(path.join(carpeta, 'ajustes.json'), `${JSON.stringify(ajustes, null, 2)}\n`);
  return { carpeta, ajustes, skills, roles, args: argumentosConfig(ajustes) };
}

/** Skills globales de usuario: solo se sincronizan los nombres propios, conservando los demás. */
export function instalarSkillsCodex({ agente, trabajo, env }) {
  const origen = path.join(agente, 'config', 'skills');
  if (!fs.existsSync(origen)) return [];
  const destino = path.join(env.HOME ?? path.dirname(env.CODEX_HOME ?? path.join(trabajo, 'casa', '.codex')), '.agents', 'skills');
  fs.mkdirSync(destino, { recursive: true });
  const nuestra = (n) => /^(nullraptor-|anthropic-)/.test(n);
  const nombres = fs.readdirSync(origen).filter((n) => nuestra(n) && fs.existsSync(path.join(origen, n, 'SKILL.md')));
  for (const nombre of nombres) {
    const carpeta = path.join(destino, nombre);
    fs.rmSync(carpeta, { recursive: true, force: true });
    fs.cpSync(path.join(origen, nombre), carpeta, { recursive: true });
    const archivo = path.join(carpeta, 'SKILL.md');
    fs.writeFileSync(archivo, adaptarInstruccionesCodex(fs.readFileSync(archivo, 'utf8')));
  }
  for (const nombre of fs.readdirSync(destino)) {
    if (nuestra(nombre) && !nombres.includes(nombre)) fs.rmSync(path.join(destino, nombre), { recursive: true, force: true });
  }
  return nombres;
}

/** Los roles de lectura conservan su restricción de no editar; no se trasladan modelos ni herramientas Claude. */
export function instalarRolesCodex({ agente, carpeta }) {
  const origen = path.join(agente, 'config', 'agentes');
  if (!fs.existsSync(origen)) return {};
  const destino = path.join(carpeta, 'agentes');
  const roles = {};
  for (const archivo of fs.readdirSync(origen).filter((n) => /^equipo-[\w-]+\.md$/.test(n))) {
    const nombre = path.basename(archivo, '.md');
    const texto = fs.readFileSync(path.join(origen, archivo), 'utf8');
    const descripcion = texto.match(/^description: (.+)$/m)?.[1] ?? nombre;
    const config = path.join(destino, `${nombre}.toml`);
    guardarPrivado(config, `developer_instructions = ${toml(contenidoRolCodex(agente, nombre, texto))}\n`);
    roles[nombre] = { description: nombre === 'equipo-desarrollo' ? 'Iker: implementa directamente la tarea autorizada en Codex.' : descripcion, config_file: config };
  }
  if (fs.existsSync(destino)) for (const archivo of fs.readdirSync(destino)) {
    if (/^equipo-[\w-]+\.toml$/.test(archivo) && !roles[path.basename(archivo, '.toml')]) fs.rmSync(path.join(destino, archivo));
  }
  return roles;
}
