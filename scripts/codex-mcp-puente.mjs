// Puente externo para los MCP aprobados: stdio, HTTP y SSE. Las credenciales se leen solo al lanzar el servidor.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function entornoMcp(config, base = process.env) {
  const comunes = Object.fromEntries(['PATH', 'HOME', 'LANG', 'TZ', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot']
    .filter((k) => base[k]).map((k) => [k, base[k]]));
  return { ...comunes, ...config.env };
}

/** Solo anuncia las capacidades que el puente implementa, sin prometer suscripciones ni otros métodos. */
export function capacidadesPuente(remotas = {}) {
  return Object.fromEntries(['tools', 'resources', 'prompts'].filter((clave) => remotas[clave])
    .map((clave) => [clave, remotas[clave].listChanged ? { listChanged: true } : {}]));
}

export async function arrancarPuente(config) {
  if (config.command) {
    const hijo = spawn(config.command, config.args ?? [], { cwd: config.cwd, env: entornoMcp(config), stdio: ['pipe', 'pipe', 'inherit'] });
    process.stdin.pipe(hijo.stdin);
    hijo.stdout.pipe(process.stdout);
    hijo.stdin.on('error', () => {});
    for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(senal, () => hijo.kill(senal));
    hijo.on('error', () => { console.error('No se pudo arrancar el servidor MCP aprobado.'); process.exitCode = 1; });
    hijo.on('exit', (codigo, senal) => process.exit(codigo ?? (senal ? 1 : 0)));
    return;
  }
  if (!/^https?:\/\//.test(config.url ?? '')) throw new Error('Transporte MCP desconocido.');
  // SDK fijado como dependencia directa; la web y el servidor del panel siguen sin dependencias de ejecución.
  const [{ Client }, { Server }, { StdioServerTransport }, tipos] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'), import('@modelcontextprotocol/sdk/server/index.js'),
    import('@modelcontextprotocol/sdk/server/stdio.js'), import('@modelcontextprotocol/sdk/types.js'),
  ]);
  const cliente = new Client({ name: 'nullraptor-codex', version: '1' });
  const url = new URL(config.url);
  const requestInit = { headers: config.headers ?? {} };
  const remoto = config.type === 'sse'
    ? new (await import('@modelcontextprotocol/sdk/client/sse.js')).SSEClientTransport(url, { requestInit,
      eventSourceInit: { fetch: (u, opciones) => fetch(u, { ...opciones, headers: { ...opciones?.headers, ...config.headers } }) } })
    : new (await import('@modelcontextprotocol/sdk/client/streamableHttp.js')).StreamableHTTPClientTransport(url, { requestInit });
  await cliente.connect(remoto);
  const capacidades = cliente.getServerCapabilities();
  const servidor = new Server({ name: 'nullraptor-codex', version: '1' }, { capabilities: capacidadesPuente(capacidades) });
  const metodos = [
    ['tools', 'ListToolsRequestSchema', 'listTools'], ['tools', 'CallToolRequestSchema', 'callTool'],
    ['resources', 'ListResourcesRequestSchema', 'listResources'], ['resources', 'ReadResourceRequestSchema', 'readResource'],
    ['resources', 'ListResourceTemplatesRequestSchema', 'listResourceTemplates'],
    ['prompts', 'ListPromptsRequestSchema', 'listPrompts'], ['prompts', 'GetPromptRequestSchema', 'getPrompt'],
  ];
  for (const [capacidad, esquema, metodo] of metodos) {
    if (capacidades?.[capacidad]) servidor.setRequestHandler(tipos[esquema], (peticion) => cliente[metodo](peticion.params));
  }
  for (const [capacidad, esquema, metodo] of [
    ['tools', 'ToolListChangedNotificationSchema', 'sendToolListChanged'],
    ['resources', 'ResourceListChangedNotificationSchema', 'sendResourceListChanged'],
    ['prompts', 'PromptListChangedNotificationSchema', 'sendPromptListChanged'],
  ]) {
    if (capacidades?.[capacidad]?.listChanged) cliente.setNotificationHandler(tipos[esquema], () => servidor[metodo]());
  }
  servidor.onclose = () => cliente.close();
  for (const senal of ['SIGINT', 'SIGTERM']) process.on(senal, () => servidor.close());
  await servidor.connect(new StdioServerTransport());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const [archivo, nombre] = process.argv.slice(2);
    const config = JSON.parse(fs.readFileSync(archivo, 'utf8')).mcpServers?.[nombre];
    if (!config) throw new Error('Servidor no aprobado.');
    await arrancarPuente(config);
  } catch {
    console.error('No se pudo conectar el MCP de Codex. Revisa su aprobación y configuración en el panel.');
    process.exitCode = 1;
  }
}
