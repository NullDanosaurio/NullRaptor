// Integración del puente con servidores MCP reales y credenciales ficticias, siempre sobre localhost.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema,
  ReadResourceRequestSchema, ListResourceTemplatesRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const puente = fileURLToPath(new URL('../scripts/codex-mcp-puente.mjs', import.meta.url));

function servidorMcp() {
  const servidor = new Server({ name: 'remoto-de-prueba', version: '1' }, { capabilities: { tools: {}, resources: {} } });
  servidor.setRequestHandler(ListToolsRequestSchema, () => ({ tools: [{ name: 'eco', description: 'Devuelve el texto',
    inputSchema: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] } }] }));
  servidor.setRequestHandler(CallToolRequestSchema, ({ params }) => ({ content: [{ type: 'text', text: params.arguments.texto }] }));
  servidor.setRequestHandler(ListResourcesRequestSchema, () => ({ resources: [{ uri: 'prueba://nota', name: 'Nota' }] }));
  servidor.setRequestHandler(ReadResourceRequestSchema, ({ params }) => ({ contents: [{ uri: params.uri, text: 'memoria compartida' }] }));
  servidor.setRequestHandler(ListResourceTemplatesRequestSchema, () => ({ resourceTemplates: [] }));
  return servidor;
}

for (const tipo of ['http', 'sse']) {
  test(`puente ${tipo}: herramientas, recursos y cabecera autorizada con transporte real`, { timeout: 20_000 }, async (t) => {
    const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'nullraptor-remoto-'));
    const remoto = servidorMcp();
    let transporte;
    const cabeceras = [];
    const errores = [];
    const web = http.createServer(async (req, res) => {
      cabeceras.push(req.headers.authorization);
      if (req.headers.authorization !== 'Bearer autorizacion-ficticia') {
        res.writeHead(401).end();
        return;
      }
      try {
        if (tipo === 'http') await transporte.handleRequest(req, res);
        else if (req.method === 'GET' && req.url === '/sse') {
          transporte = new SSEServerTransport('/mensajes', res);
          await remoto.connect(transporte);
        } else if (req.method === 'POST' && req.url.startsWith('/mensajes')) {
          await transporte.handlePostMessage(req, res);
        } else res.writeHead(404).end();
      } catch (error) {
        errores.push(error.message);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    });
    const cliente = new Client({ name: 'codex-de-prueba', version: '1' });
    t.after(async () => {
      await cliente.close();
      await remoto.close();
      web.closeAllConnections();
      await new Promise((resolver) => web.close(resolver));
      fs.rmSync(carpeta, { recursive: true, force: true });
    });
    if (tipo === 'http') {
      transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
      await remoto.connect(transporte);
    }
    await new Promise((resolver, rechazar) => {
      web.once('error', rechazar);
      web.listen(0, '127.0.0.1', resolver);
    });
    const archivo = path.join(carpeta, 'mcp.json');
    fs.writeFileSync(archivo, JSON.stringify({ mcpServers: { remoto: {
      type: tipo, url: `http://127.0.0.1:${web.address().port}/${tipo === 'sse' ? 'sse' : 'mcp'}`,
      headers: { Authorization: 'Bearer autorizacion-ficticia' },
    } } }), { mode: 0o600 });
    const stdio = new StdioClientTransport({ command: process.execPath, args: [puente, archivo, 'remoto'], stderr: 'pipe' });
    let diagnostico = '';
    stdio.stderr.on('data', (dato) => { diagnostico += dato.toString(); });
    await cliente.connect(stdio);
    assert.equal((await cliente.listTools()).tools[0].name, 'eco');
    assert.deepEqual((await cliente.callTool({ name: 'eco', arguments: { texto: 'respuesta del servidor' } })).content,
      [{ type: 'text', text: 'respuesta del servidor' }]);
    assert.equal((await cliente.listResources()).resources[0].uri, 'prueba://nota');
    assert.equal((await cliente.readResource({ uri: 'prueba://nota' })).contents[0].text, 'memoria compartida');
    assert.deepEqual((await cliente.listResourceTemplates()).resourceTemplates, []);
    assert.ok(cabeceras.length >= 5);
    assert.ok(cabeceras.every((valor) => valor === 'Bearer autorizacion-ficticia'));
    assert.deepEqual(errores, []);
    assert.equal(diagnostico, '');
  });
}
