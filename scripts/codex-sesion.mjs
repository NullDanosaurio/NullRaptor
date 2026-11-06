// Preparación única para abrir, reanudar o relevar: mismas autorizaciones y memoria que Claude.
import { escribirMcp } from './ia.mjs';
import { prepararCodex } from './codex-config.mjs';

export function prepararSesionCodex({ agente, env, memoria, trabajo, perfil = null }) {
  const mcp = escribirMcp({ agente, env, memoria, trabajo });
  return prepararCodex({ agente, env, trabajo, mcp, perfil });
}
