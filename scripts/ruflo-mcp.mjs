// MCP de Ruflo con la carpeta del agente como raíz, aunque Claude trabaje dentro de un proyecto:
// así .swarm/ y .claude-flow/ nunca se escriben en los repositorios de proyectos.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hijo = spawn(process.execPath, [path.join(agente, 'node_modules/ruflo/bin/ruflo.js'), 'mcp', 'start'], { cwd: agente, stdio: 'inherit' });
hijo.on('exit', (code) => process.exit(code ?? 1));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => hijo.kill(s));
