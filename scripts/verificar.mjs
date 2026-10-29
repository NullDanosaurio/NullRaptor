// Verificación del agente portátil: MCP de Ruflo, memoria persistente y vault en solo lectura.
// Sale con código 1 si falla algún punto obligatorio. Ejecutar dos veces para comprobar persistencia.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  env: process.env, // el SDK solo pasa PATH/HOME…; Ruflo necesita sus CLAUDE_FLOW_* (ruta de memoria, motor)
});
const limite = setTimeout(() => { console.error('Tiempo agotado conectando con el MCP'); process.exit(1); }, 60000);

try {
  await cliente.connect(transporte);
  const { tools } = await cliente.listTools();
  anotar('mcp', tools.length > 0, { herramientas: tools.length });

  // Operación representativa: leer, incrementar y guardar un contador en la memoria de Ruflo.
  // Ruflo responde JSON: { found, value } al leer y { success, backend } al guardar.
  const json = (r) => { try { return JSON.parse(texto(r)); } catch { return { crudo: texto(r).slice(0, 300) }; } };
  const clave = { key: 'verificacion/arranques', namespace: 'portable' };
  const previo = json(await cliente.callTool({ name: 'memory_retrieve', arguments: clave }));
  const n = (previo.found ? Number(previo.value) : 0) + 1;
  const guardado = json(await cliente.callTool({ name: 'memory_store', arguments: { ...clave, value: String(n), provenance_type: 'system_observation' } }));
  const leido = json(await cliente.callTool({ name: 'memory_retrieve', arguments: clave }));
  const ok = guardado.success === true && leido.found === true && String(leido.value) === String(n); // Ruflo devuelve número
  anotar('memoria', ok, { arranques: n, backend: guardado.backend, ...(ok ? {} : { previo, guardado, leido }) });
} catch (e) {
  anotar('mcp', false, { error: String(e?.message ?? e) });
} finally {
  clearTimeout(limite);
  await cliente.close().catch(() => {});
}

// Memoria (vault de Obsidian clonado por preparar.mjs): debe tener notas y estar en la rama del agente.
const boveda = process.env.BOVEDA_DIR;
if (!boveda) {
  anotar('boveda', true, { omitida: 'BOVEDA_DIR no definida' });
} else {
  let notas = 0, rama = null, error = null;
  const contar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith('.')) continue; const p = path.join(d, e.name); if (e.isDirectory()) contar(p); else if (e.name.endsWith('.md')) notas++; } };
  try { contar(boveda); rama = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: boveda, encoding: 'utf8' }).trim(); } catch (e) { error = String(e.message); }
  anotar('boveda', !error && notas > 0 && rama === 'agente', { notas, rama, error: error ?? undefined });
}

console.log(JSON.stringify(informe, null, 2));
process.exit(informe.ok ? 0 : 1);
