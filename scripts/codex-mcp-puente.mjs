// Puente externo para los MCP aprobados: stdio, HTTP y SSE. Las credenciales se leen solo al lanzar el servidor.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AUTOAPROBADAS } from './codex-mcp.mjs';

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

const ID_PROPIO = 'nullraptor-esquemas';
const OCULTO = /^db_?path$/i; // parámetro oculto de las herramientas de memoria de Ruflo (abre cualquier archivo como SQLite)

/** Filtro por construcción de las herramientas de un servidor con lista cerrada (AUTOAPROBADAS, misma fuente que
 * `enabled_tools` de Codex): `tools/list` solo trae las permitidas y `tools/call` de otra se rechaza SIN llegar al servidor real.
 * Los argumentos de cada llamada se validan contra el esquema real de la herramienta (claves desconocidas y `dbPath`
 * se rechazan; sin esquema, cae cerrado). Los nombres se comparan exactos (el servidor real no conoce prefijos mcp__x__). */
export function crearFiltro(permitidas, nombre = 'mcp', aviso = (m) => console.error(m)) {
  const permitido = (t) => typeof t === 'string' && permitidas.includes(t);
  const listas = new Set(); // ids de tools/list pendientes
  const esquemas = new Map(); // herramienta -> claves de entrada permitidas
  const error = (id, texto) => ({ jsonrpc: '2.0', id, error: { code: -32602, message: texto } });
  const aprender = (tools) => { for (const t of tools ?? []) if (typeof t?.name === 'string') esquemas.set(t.name, new Set(Object.keys(t.inputSchema?.properties ?? {}))); };
  /** Motivo de rechazo de una llamada, o null si es válida. */
  function validar(herramienta, args) {
    if (!permitido(herramienta)) return `Herramienta no permitida por Nullraptor: ${String(herramienta).slice(0, 80)}`;
    if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) return 'Argumentos no válidos.';
    const claves = Object.keys(args ?? {});
    if (claves.some((k) => OCULTO.test(k))) return 'Parámetro no permitido por Nullraptor: dbPath.';
    const esquema = esquemas.get(herramienta);
    if (!esquema) return 'Esquema de la herramienta desconocido: llamada rechazada.';
    const extra = claves.find((k) => !esquema.has(k));
    return extra === undefined ? null : `Parámetro no permitido por Nullraptor: ${extra.slice(0, 60)}.`;
  }
  /** Una línea de Codex hacia el servidor: { enviar: texto|null, responder: [objetos], extra: [texto], retener: bool }.
   * `retener`: la llamada llegó antes de conocer los esquemas; reintentar cuando `listo()`. */
  function entrada(linea, { final = false } = {}) {
    if (!linea.trim()) return { enviar: null, responder: [], extra: [] };
    let msg;
    try { msg = JSON.parse(linea); } catch { aviso(`[puente ${nombre}] mensaje no JSON descartado`); return { enviar: null, responder: [], extra: [] }; }
    const responder = [];
    const extra = [];
    let retener = false;
    const pasa = (m) => {
      if (m?.method === 'tools/call') {
        if (permitido(m.params?.name) && !esquemas.size && !final && !Array.isArray(msg)) { retener = true; return false; }
        const motivo = validar(m.params?.name, m.params?.arguments);
        if (motivo) {
          aviso(`[puente ${nombre}] llamada rechazada («${String(m.params?.name).slice(0, 80)}»): ${motivo}`);
          if (m.id !== undefined) responder.push(error(m.id, motivo));
          return false;
        }
      }
      if (m?.method === 'tools/list' && m.id !== undefined) listas.add(m.id);
      if (m?.method === 'notifications/initialized') extra.push(JSON.stringify({ jsonrpc: '2.0', id: ID_PROPIO, method: 'tools/list' }));
      return true;
    };
    const resto = Array.isArray(msg) ? msg.filter(pasa) : pasa(msg) ? msg : null;
    const vacio = resto === null || (Array.isArray(resto) && !resto.length);
    return { enviar: vacio ? null : JSON.stringify(resto), responder, extra, retener };
  }
  /** Una línea del servidor hacia Codex (null = no reenviar): aprende los esquemas y quita de tools/list las no permitidas. */
  function salida(linea) {
    let msg;
    try { msg = JSON.parse(linea); } catch { return linea; }
    if (!Array.isArray(msg) && msg?.id === ID_PROPIO) { aprender(msg.result?.tools); return null; }
    const f = (m) => {
      if (m && m.id !== undefined && listas.delete(m.id) && Array.isArray(m.result?.tools)) {
        aprender(m.result.tools);
        m.result.tools = m.result.tools.filter((t) => permitido(t?.name));
      }
      return m;
    };
    return JSON.stringify(Array.isArray(msg) ? msg.map(f) : f(msg));
  }
  return { entrada, salida, permitido, validar, aprender, listo: () => esquemas.size > 0 };
}

/** Divide un flujo en líneas completas y las entrega una a una (el resto espera al siguiente bloque). */
function porLineas(flujo, alLinea, alFin) {
  let resto = '';
  flujo.setEncoding('utf8');
  flujo.on('data', (d) => { resto += d; const l = resto.split('\n'); resto = l.pop(); l.forEach(alLinea); });
  flujo.on('end', () => { if (resto) alLinea(resto); alFin?.(); });
}

export async function arrancarPuente(config, nombre = '') {
  const permitidas = Object.hasOwn(AUTOAPROBADAS, nombre) ? AUTOAPROBADAS[nombre] : undefined; // sin claves heredadas (constructor...)
  if (config.command) {
    const hijo = spawn(config.command, config.args ?? [], { cwd: config.cwd, env: entornoMcp(config), stdio: ['pipe', 'pipe', 'inherit'] });
    if (permitidas) {
      const filtro = crearFiltro(permitidas, nombre);
      const retenidas = [];
      let reloj = null;
      const procesar = (l, final = false) => {
        const { enviar, responder, extra, retener } = filtro.entrada(l, { final });
        if (retener) { retenidas.push(l); reloj ??= setTimeout(() => { reloj = null; retenidas.splice(0).forEach((x) => procesar(x, true)); }, 10_000); return; }
        for (const r of responder) process.stdout.write(`${JSON.stringify(r)}\n`);
        if (enviar) hijo.stdin.write(`${enviar}\n`);
        for (const x of extra) hijo.stdin.write(`${x}\n`);
      };
      porLineas(process.stdin, (l) => procesar(l), () => hijo.stdin.end());
      porLineas(hijo.stdout, (l) => {
        if (!l.trim()) return;
        const salida = filtro.salida(l);
        if (salida !== null) process.stdout.write(`${salida}\n`);
        if (retenidas.length && filtro.listo()) { clearTimeout(reloj); reloj = null; retenidas.splice(0).forEach((x) => procesar(x)); }
      });
    } else {
      process.stdin.pipe(hijo.stdin);
      hijo.stdout.pipe(process.stdout);
    }
    hijo.stdin.on('error', () => {});
    for (const senal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(senal, () => hijo.kill(senal));
    hijo.on('error', () => { console.error('No se pudo arrancar el servidor MCP aprobado.'); process.exitCode = 1; });
    hijo.on(permitidas ? 'close' : 'exit', (codigo, senal) => process.exit(codigo ?? (senal ? 1 : 0)));
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
  const filtro = permitidas ? crearFiltro(permitidas, nombre) : null;
  const metodos = [
    ['tools', 'ListToolsRequestSchema', 'listTools'], ['tools', 'CallToolRequestSchema', 'callTool'],
    ['resources', 'ListResourcesRequestSchema', 'listResources'], ['resources', 'ReadResourceRequestSchema', 'readResource'],
    ['resources', 'ListResourceTemplatesRequestSchema', 'listResourceTemplates'],
    ['prompts', 'ListPromptsRequestSchema', 'listPrompts'], ['prompts', 'GetPromptRequestSchema', 'getPrompt'],
  ];
  for (const [capacidad, esquema, metodo] of metodos) {
    if (!capacidades?.[capacidad]) continue;
    if (permitidas && metodo === 'listTools') servidor.setRequestHandler(tipos[esquema], async (peticion) => { const r = await cliente.listTools(peticion.params); filtro.aprender(r.tools); return { ...r, tools: r.tools.filter((t) => permitidas.includes(t.name)) }; });
    else if (permitidas && metodo === 'callTool') servidor.setRequestHandler(tipos[esquema], async (peticion) => {
      if (!filtro.listo()) filtro.aprender((await cliente.listTools()).tools);
      const motivo = filtro.validar(peticion.params?.name, peticion.params?.arguments);
      if (motivo) { console.error(`[puente ${nombre}] llamada rechazada: ${motivo}`); throw new Error(motivo); }
      return cliente.callTool(peticion.params);
    });
    else servidor.setRequestHandler(tipos[esquema], (peticion) => cliente[metodo](peticion.params));
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
    await arrancarPuente(config, nombre);
  } catch {
    console.error('No se pudo conectar el MCP de Codex. Revisa su aprobación y configuración en el panel.');
    process.exitCode = 1;
  }
}
