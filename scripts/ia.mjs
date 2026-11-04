// Configuración de la IA que Nullraptor da desde fuera a cada sesión, sin dejar nada en los repositorios:
//  - instrucciones globales (config/claude-global.md → CLAUDE_CONFIG_DIR/CLAUDE.md), iguales en todos los proyectos;
//  - servidores MCP (Ruflo, los autorizados y las herramientas propias aprobadas) en $TRABAJO_DIR/.mcp-agente.json,
//    para pasarlo con --mcp-config.
//  - el equipo del Director IA (config/agentes/equipo-*.md → CLAUDE_CONFIG_DIR/agents/) y los perfiles que se añaden a
//    una sesión con --append-system-prompt (config/perfiles/<perfil>.md; lista cerrada PERFILES).
//  - los ajustes de ahorro de tokens (AHORRO) en CLAUDE_CONFIG_DIR/settings.json, sin tocar el resto del archivo;
// También retira las copias de Ruflo que versiones anteriores dejaban en la configuración global.
import fs from 'node:fs';
import path from 'node:path';
import { configHerramientas } from './herramientas.mjs';
import { aConfigMcp, leerEstado } from './mcp.mjs';

export const ARCHIVO_MCP = '.mcp-agente.json';
/** Perfiles que se pueden pedir al abrir una sesión o un chat. Lista cerrada: nunca una ruta que venga del cliente. */
export const PERFILES = ['director'];
const PREFIJO_EQUIPO = 'equipo-';

/** Ahorro de tokens (decisión [U] 04/11/2026, medido: 99,6 % del gasto en Opus y 65 % en releer contexto):
 * Opus solo para planificar (opusplan: Sonnet ejecuta), compactar antes la conversación, acotar la salida de Bash y
 * de los MCP, y no cargar en cada sesión los conectores de claude.ai (Gmail, Drive, Notion…), que aquí no se usan. */
export const AHORRO = {
  model: 'opusplan',
  env: {
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: '50',
    BASH_MAX_OUTPUT_LENGTH: '15000',
    MAX_MCP_OUTPUT_TOKENS: '10000',
    ENABLE_CLAUDEAI_MCP_SERVERS: 'false',
  },
};

/** settings.json con los ajustes de AHORRO encima de lo que hubiera (el resto de claves se conserva). */
export function conAhorro(ajustes) {
  const base = ajustes && typeof ajustes === 'object' && !Array.isArray(ajustes) ? ajustes : {};
  const env = base.env && typeof base.env === 'object' ? base.env : {};
  return { ...base, model: AHORRO.model, env: { ...env, ...AHORRO.env } };
}

function aplicarAhorro(configDir) {
  const archivo = path.join(configDir, 'settings.json');
  let actuales = {};
  try { actuales = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch { /* no hay o no es JSON: se empieza de cero */ }
  const temporal = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, `${JSON.stringify(conAhorro(actuales), null, 2)}\n`);
  fs.renameSync(temporal, archivo);
}

// Lo que antes se copiaba de .claude/ del agente a la configuración global (hasta el 30/10/2026).
const ANTIGUOS = {
  agents: ['browser', 'consensus', 'core', 'sparc', 'swarm', 'testing'],
  commands: ['agents', 'analysis', 'automation', 'claude-flow-help.md', 'claude-flow-memory.md', 'claude-flow-swarm.md',
    'coordination', 'github', 'hive-mind', 'hooks', 'memory', 'monitoring', 'optimization', 'sparc', 'swarm', 'workflows'],
  skills: ['agentdb-advanced', 'agentdb-learning', 'agentdb-memory-patterns', 'agentdb-optimization', 'agentdb-vector-search',
    'browser', 'github-code-review', 'github-multi-repo', 'github-project-management', 'github-release-management',
    'github-workflow-automation', 'hooks-automation', 'pair-programming', 'reasoningbank-agentdb', 'reasoningbank-intelligence',
    'skill-builder', 'sparc-methodology', 'stream-chain', 'swarm-advanced', 'swarm-orchestration', 'verification-quality'],
};

/** Retira de la configuración global lo que Ruflo dejaba allí (solo esos nombres; lo demás no se toca). */
export function retirarAntiguos(configDir) {
  for (const [carpeta, nombres] of Object.entries(ANTIGUOS)) {
    for (const n of nombres) fs.rmSync(path.join(configDir, carpeta, n), { recursive: true, force: true });
  }
}

/** Texto de un perfil (config/perfiles/<perfil>.md). Lanza con `codigo` 400 si no está en PERFILES. */
export function leerPerfil(agente, perfil) {
  if (!PERFILES.includes(perfil)) throw Object.assign(new Error('Perfil desconocido.'), { codigo: 400 });
  return fs.readFileSync(path.join(agente, 'config', 'perfiles', `${perfil}.md`), 'utf8').trim();
}

/** Copia el equipo (config/agentes/equipo-*.md) a <configDir>/agents y retira los equipo-*.md que ya no existan en
 * config/agentes. Los demás agentes no se tocan; sin config/agentes no se borra nada. */
export function instalarEquipo(agente, configDir) {
  const origen = path.join(agente, 'config', 'agentes');
  if (!fs.existsSync(origen)) return [];
  const destino = path.join(configDir, 'agents');
  fs.mkdirSync(destino, { recursive: true });
  const nuestros = fs.readdirSync(origen).filter((n) => n.startsWith(PREFIJO_EQUIPO) && n.endsWith('.md'));
  for (const n of nuestros) fs.copyFileSync(path.join(origen, n), path.join(destino, n));
  for (const n of fs.readdirSync(destino)) {
    if (n.startsWith(PREFIJO_EQUIPO) && n.endsWith('.md') && !nuestros.includes(n)) fs.rmSync(path.join(destino, n), { force: true });
  }
  return nuestros;
}

/** Config MCP: Ruflo con raíz en el agente (su estado nunca cae en un proyecto), los MCP autorizados y las
 * herramientas propias aprobadas en el panel. */
export function configMcp({ agente, env, memoria, trabajo }) {
  const base = JSON.parse(fs.readFileSync(path.join(agente, 'config', 'mcp.json'), 'utf8'));
  base.mcpServers.ruflo.args = [path.join(agente, 'scripts', 'ruflo-mcp.mjs')];
  // Explícitas: un cliente MCP puede no heredar el entorno, y sin ellas Ruflo guarda la memoria fuera del volumen.
  Object.assign(base.mcpServers.ruflo.env, Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('CLAUDE_FLOW_'))));
  if (memoria) Object.assign(base.mcpServers, aConfigMcp(leerEstado(memoria).instalados, env));
  if (trabajo) Object.assign(base.mcpServers, configHerramientas({ agente, trabajo, env }));
  return base;
}

/** (Re)escribe $TRABAJO_DIR/.mcp-agente.json. El panel lo llama al aprobar o desactivar una herramienta y antes de
 * abrir cada sesión: así una herramienta nueva llega sin reiniciar nada. */
export function escribirMcp({ agente, env, memoria, trabajo }) {
  const mcp = path.join(trabajo, ARCHIVO_MCP);
  fs.mkdirSync(trabajo, { recursive: true });
  // Lleva las variables de los MCP autorizados y de las herramientas (del cofre): solo para este usuario.
  const temporal = `${mcp}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(configMcp({ agente, env, memoria, trabajo }), null, 2), { mode: 0o600 });
  fs.renameSync(temporal, mcp);
  return mcp;
}

/** Deja lista la configuración de la IA. Devuelve la ruta del archivo MCP. */
export function prepararIA({ agente, env, memoria, trabajo }) {
  const configDir = env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.copyFileSync(path.join(agente, 'config', 'claude-global.md'), path.join(configDir, 'CLAUDE.md'));
    retirarAntiguos(configDir);
    instalarEquipo(agente, configDir);
    aplicarAhorro(configDir);
  }
  return escribirMcp({ agente, env, memoria, trabajo });
}
