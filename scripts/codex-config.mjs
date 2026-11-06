// Capa propia de Codex, persistente y externa a los proyectos. No modifica config.toml ni la autenticación.
import fs from 'node:fs';
import path from 'node:path';
import { argumentosConfig, ajustesMcpCodex } from './codex-mcp.mjs';

export function guardarPrivado(archivo, texto) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
  const temporal = `${archivo}.${process.pid}.tmp`;
  fs.writeFileSync(temporal, texto, { mode: 0o600 });
  fs.renameSync(temporal, archivo);
}

/** `mcp` es el archivo privado generado por escribirMcp, compartido con Claude. */
export function prepararCodex({ agente, trabajo, mcp }) {
  const carpeta = path.join(trabajo, '.codex-nullraptor');
  const ajustes = ajustesMcpCodex({ agente, mcp });
  guardarPrivado(path.join(carpeta, 'ajustes.json'), `${JSON.stringify(ajustes, null, 2)}\n`);
  return { carpeta, ajustes, args: argumentosConfig(ajustes) };
}
