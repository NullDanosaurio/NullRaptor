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

/** Un puente por servidor conserva los nombres MCP y lee la configuración privada al arrancar. */
export function ajustesMcpCodex({ agente, mcp }) {
  const { mcpServers } = JSON.parse(fs.readFileSync(mcp, 'utf8'));
  // Codex divide las claves -c por puntos sin interpretar comillas: los nombres van dentro de la tabla TOML.
  return { mcp_servers: Object.fromEntries(Object.keys(mcpServers).map((nombre) => [
    nombre,
    { command: process.execPath, args: [path.join(agente, 'scripts', 'codex-mcp-puente.mjs'), mcp, nombre], enabled: true, startup_timeout_sec: 60 },
  ])) };
}
