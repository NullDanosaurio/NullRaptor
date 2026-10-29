// Verificación del agente portátil: MCP de Ruflo, memoria persistente y vault en solo lectura.
// Sale con código 1 si falla algún punto obligatorio. Ejecutar dos veces para comprobar persistencia.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const proyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = (p) => JSON.parse(fs.readFileSync(path.join(proyecto, 'node_modules', p, 'package.json'), 'utf8')).version;
const informe = { fecha: new Date().toISOString(), node: process.version, ruflo: version('ruflo'), claudeCode: version('@anthropic-ai/claude-code'), ok: true, pruebas: {} };
const anotar = (nombre, ok, detalle) => { informe.pruebas[nombre] = { ok, ...detalle }; if (!ok) informe.ok = false; };

const texto = (r) => r.content?.map((c) => c.text ?? '').join('') ?? '';
const cliente = new Client({ name: 'verificar-portable', version: '1.0.0' });
const transporte = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(proyecto, 'node_modules/ruflo/bin/ruflo.js'), 'mcp', 'start'],
  cwd: proyecto,
  stderr: 'pipe',
});
const limite = setTimeout(() => { console.error('Tiempo agotado conectando con el MCP'); process.exit(1); }, 60000);

try {
  await cliente.connect(transporte);
  const { tools } = await cliente.listTools();
  anotar('mcp', tools.length > 0, { herramientas: tools.length });

  // Operación representativa: leer, incrementar y guardar un contador en la memoria de Ruflo.
  const clave = { key: 'verificacion/arranques', namespace: 'portable' };
  const previo = await cliente.callTool({ name: 'memory_retrieve', arguments: clave });
  const previoTexto = texto(previo);
  const errorLectura = previo.isError ? previoTexto : null;
  const n = Number(/"value"\s*:\s*"?(\d+)/.exec(previoTexto)?.[1] ?? 0) + 1;
  const guardado = await cliente.callTool({ name: 'memory_store', arguments: { ...clave, value: String(n), provenance_type: 'system_observation' } });
  const leido = texto(await cliente.callTool({ name: 'memory_retrieve', arguments: clave }));
  const ok = !errorLectura && !guardado.isError && leido.includes(String(n));
  anotar('memoria', ok, { arranques: n, error: errorLectura ?? (guardado.isError ? texto(guardado) : undefined) });
} catch (e) {
  anotar('mcp', false, { error: String(e?.message ?? e) });
} finally {
  clearTimeout(limite);
  await cliente.close().catch(() => {});
}

// Vault de Obsidian: debe poder leerse y no debe poder escribirse.
const boveda = process.env.BOVEDA_DIR;
if (!boveda) {
  anotar('boveda', true, { omitida: 'BOVEDA_DIR no definida' });
} else {
  let notas = 0;
  const contar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) contar(p); else if (e.name.endsWith('.md')) notas++; } };
  let lectura = null, soloLectura = false;
  try { contar(boveda); } catch (e) { lectura = String(e.message); }
  try { fs.writeFileSync(path.join(boveda, '.prueba-escritura'), 'x'); fs.rmSync(path.join(boveda, '.prueba-escritura')); } catch { soloLectura = true; }
  anotar('boveda', !lectura && notas > 0 && soloLectura, { notas, soloLectura, error: lectura ?? undefined });
}

console.log(JSON.stringify(informe, null, 2));
process.exit(informe.ok ? 0 : 1);
