// Preparación única para abrir, reanudar o relevar: mismas autorizaciones y memoria que Claude.
import path from 'node:path';
import { ARCHIVO_MCP, escribirMcp } from './ia.mjs';
import { prepararCodex } from './codex-config.mjs';

export function prepararSesionCodex({ agente, env, memoria, trabajo, perfil = null, mcpListo = false }) {
  // mcpListo: el llamador ya acaba de escribir el MCP; no se rehace.
  const mcp = mcpListo ? path.join(trabajo, ARCHIVO_MCP) : escribirMcp({ agente, env, memoria, trabajo });
  return prepararCodex({ agente, env, trabajo, mcp, perfil });
}
