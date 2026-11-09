// Preparación única para abrir, reanudar o relevar: mismas autorizaciones y memoria que Claude.
import fs from 'node:fs';
import path from 'node:path';
import { ARCHIVO_MCP, escribirMcp } from './ia.mjs';
import { prepararCodex } from './codex-config.mjs';

export function prepararSesionCodex({ agente, env, memoria, trabajo, perfil = null, mcpListo = false }) {
  // mcpListo: el llamador ya acaba de escribir el MCP; no se rehace.
  // Rutas de secretos que el panel crea tarde: han de existir para que el sandbox las oculte.
  fs.mkdirSync(path.join(trabajo, 'registros'), { recursive: true, mode: 0o700 });
  const mcp = mcpListo ? path.join(trabajo, ARCHIVO_MCP) : escribirMcp({ agente, env, memoria, trabajo });
  return prepararCodex({ agente, env, trabajo, mcp, perfil });
}
