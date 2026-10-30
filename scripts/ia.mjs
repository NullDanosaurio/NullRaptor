// Configuración de la IA que Nullraptor da desde fuera a cada sesión, sin dejar nada en los repositorios:
//  - instrucciones globales (config/claude-global.md → CLAUDE_CONFIG_DIR/CLAUDE.md), iguales en todos los proyectos;
//  - servidores MCP (Ruflo + los autorizados) en $TRABAJO_DIR/.mcp-agente.json, para pasarlo con --mcp-config.
// También retira las copias de Ruflo que versiones anteriores dejaban en la configuración global.
import fs from 'node:fs';
import path from 'node:path';
import { aConfigMcp, leerEstado } from './mcp.mjs';

export const ARCHIVO_MCP = '.mcp-agente.json';

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

/** Config MCP: Ruflo con raíz en el agente (su estado nunca cae en un proyecto) y los MCP autorizados. */
export function configMcp({ agente, env, memoria }) {
  const base = JSON.parse(fs.readFileSync(path.join(agente, 'config', 'mcp.json'), 'utf8'));
  base.mcpServers.ruflo.args = [path.join(agente, 'scripts', 'ruflo-mcp.mjs')];
  // Explícitas: un cliente MCP puede no heredar el entorno, y sin ellas Ruflo guarda la memoria fuera del volumen.
  Object.assign(base.mcpServers.ruflo.env, Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('CLAUDE_FLOW_'))));
  if (memoria) Object.assign(base.mcpServers, aConfigMcp(leerEstado(memoria).instalados, env));
  return base;
}

/** Deja lista la configuración de la IA. Devuelve la ruta del archivo MCP. */
export function prepararIA({ agente, env, memoria, trabajo }) {
  const configDir = env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.copyFileSync(path.join(agente, 'config', 'claude-global.md'), path.join(configDir, 'CLAUDE.md'));
    retirarAntiguos(configDir);
  }
  const mcp = path.join(trabajo, ARCHIVO_MCP);
  fs.mkdirSync(trabajo, { recursive: true });
  // Lleva las variables de los MCP autorizados (del cofre): solo para este usuario.
  fs.writeFileSync(mcp, JSON.stringify(configMcp({ agente, env, memoria }), null, 2), { mode: 0o600 });
  return mcp;
}
