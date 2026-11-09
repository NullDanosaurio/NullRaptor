// Adaptación de la configuración MCP compartida: Codex recibe rutas y nombres, nunca secretos en sus argumentos.
import fs from 'node:fs';
import path from 'node:path';

/** TOML en línea para los overrides -c de Codex. JSON no sirve para las tablas TOML. */
export function toml(valor) {
  if (Array.isArray(valor)) return `[${valor.map(toml).join(', ')}]`;
  if (valor && typeof valor === 'object') return `{ ${Object.entries(valor).map(([k, v]) => `${JSON.stringify(k)} = ${toml(v)}`).join(', ')} }`;
  if (['string', 'boolean', 'number'].includes(typeof valor)) return JSON.stringify(valor);
  throw new Error('Valor de configuración de Codex no admitido.');
}

export function argumentosConfig(ajustes) {
  return Object.entries(ajustes).flatMap(([clave, valor]) => ['-c', `${clave}=${toml(valor)}`]);
}

/** Herramientas MCP que Codex puede llamar SIN aprobación bajo `codex exec` (política never). Los MCP corren fuera del
 * sandbox de Codex: aprobar un servidor entero (Ruflo trae terminal_execute, http_fetch, agent_spawn, hooks...) lo saltaría.
 * Por eso solo hay listas cerradas, y nunca `approve` sin `enabled_tools`. El resto (herramientas propias, otros
 * servidores) sigue sin aprobar: falla en exec y pide aprobación en la sesión interactiva. */
export const AUTOAPROBADAS = {
  ruflo: ['task_list', 'task_create', 'task_update', 'task_complete', 'task_status', 'task_summary', 'memory_store', 'memory_retrieve', 'memory_search', 'memory_list'],
  context7: ['resolve-library-id', 'query-docs'],
};

/** Un puente por servidor conserva los nombres MCP y lee la configuración privada al arrancar. */
export function ajustesMcpCodex({ agente, mcp, registroTareas = null }) {
  const { mcpServers } = JSON.parse(fs.readFileSync(mcp, 'utf8'));
  // Codex divide las claves -c por puntos sin interpretar comillas: los nombres van dentro de la tabla TOML.
  return { mcp_servers: Object.fromEntries(Object.keys(mcpServers).map((nombre) => [
    nombre,
    { command: process.execPath, args: [path.join(agente, 'scripts', 'codex-mcp-puente.mjs'), mcp, nombre, ...(registroTareas && nombre === 'ruflo' ? [registroTareas] : [])], enabled: true, startup_timeout_sec: 60,
      ...(Object.hasOwn(AUTOAPROBADAS, nombre) ? { enabled_tools: AUTOAPROBADAS[nombre], default_tools_approval_mode: 'approve' } : {}) },
  ])) };
}
