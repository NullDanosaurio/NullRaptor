// Pruebas de la configuración de la IA (scripts/ia.mjs): instrucciones globales, MCP desde fuera de los proyectos y
// retirada de las copias de Ruflo que dejaban las versiones anteriores en la configuración global.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AHORRO, ARCHIVO_MCP, conAhorro, instalarEquipo, leerPerfil, PERFILES, prepararIA } from '../scripts/ia.mjs';
import { construirEncargo, extraerDiff, leerArchivos, rutaDentro } from '../scripts/codex-parche.mjs';

const agente = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('prepararIA: CLAUDE.md global propio, MCP de Ruflo con raíz en el agente y sin restos de Ruflo', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-'));
  const configDir = path.join(base, '.claude');
  const trabajo = path.join(base, 'trabajo');
  for (const p of ['skills/swarm-advanced', 'skills/mia', 'commands/sparc', 'agents/core']) fs.mkdirSync(path.join(configDir, p), { recursive: true });
  fs.writeFileSync(path.join(configDir, 'CLAUDE.md'), '# Ruflo — Claude Code Configuration');
  fs.writeFileSync(path.join(configDir, 'commands', 'claude-flow-help.md'), 'x');

  const env = { CLAUDE_CONFIG_DIR: configDir, CLAUDE_FLOW_MEMORY_PATH: '/estado/ruflo/swarm', GITHUB_TOKEN: 'secreto' };
  const mcp = prepararIA({ agente, env, memoria: null, trabajo });

  assert.equal(mcp, path.join(trabajo, ARCHIVO_MCP));
  assert.match(fs.readFileSync(path.join(configDir, 'CLAUDE.md'), 'utf8'), /^# Nullraptor/);
  for (const p of ['skills/swarm-advanced', 'commands/sparc', 'commands/claude-flow-help.md', 'agents/core']) assert.ok(!fs.existsSync(path.join(configDir, p)), p);
  assert.ok(fs.existsSync(path.join(configDir, 'skills', 'mia'))); // lo que no es de Ruflo se queda

  const { mcpServers } = JSON.parse(fs.readFileSync(mcp, 'utf8'));
  assert.deepEqual(mcpServers.ruflo.args, [path.join(agente, 'scripts', 'ruflo-mcp.mjs')]);
  assert.equal(mcpServers.ruflo.env.CLAUDE_FLOW_MEMORY_PATH, '/estado/ruflo/swarm');
  assert.equal(JSON.stringify(mcpServers).includes('secreto'), false); // solo pasan las CLAUDE_FLOW_*
  if (process.platform !== 'win32') assert.equal(fs.statSync(mcp).mode & 0o777, 0o600);
});

test('el repositorio no lleva andamiaje de Ruflo: solo su runtime en .claude-flow', () => {
  for (const p of ['.claude/settings.json', '.claude/helpers', '.agents', '.mcp.json']) assert.ok(!fs.existsSync(path.join(agente, p)), p);
  assert.ok(fs.existsSync(path.join(agente, 'config', 'mcp.json')));
});

test('prepararIA instala el equipo del Director: copia equipo-*, retira los obsoletos y no toca agentes ajenos', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-equipo-'));
  const configDir = path.join(base, '.claude');
  const agents = path.join(configDir, 'agents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'equipo-viejo.md'), 'obsoleto');
  fs.writeFileSync(path.join(agents, 'mio.md'), 'ajeno');
  fs.writeFileSync(path.join(agents, 'equipo-notas.txt'), 'ajeno, no es .md');
  prepararIA({ agente, env: { CLAUDE_CONFIG_DIR: configDir }, memoria: null, trabajo: path.join(base, 'trabajo') });
  const roles = ['arquitectura', 'calidad', 'desarrollo', 'diseno', 'producto', 'seguridad'].map((r) => `equipo-${r}.md`);
  for (const r of roles) assert.equal(fs.readFileSync(path.join(agents, r), 'utf8'), fs.readFileSync(path.join(agente, 'config', 'agentes', r), 'utf8'));
  assert.ok(!fs.existsSync(path.join(agents, 'equipo-viejo.md')));
  assert.equal(fs.readFileSync(path.join(agents, 'mio.md'), 'utf8'), 'ajeno');
  assert.ok(fs.existsSync(path.join(agents, 'equipo-notas.txt')));
  // Sin config/agentes no se borra nada.
  const sinEquipo = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-sin-'));
  assert.deepEqual(instalarEquipo(sinEquipo, configDir), []);
  assert.ok(fs.existsSync(path.join(agents, 'equipo-calidad.md')));
});

test('subagentes: frontmatter válido, herramientas por rol, veto y modelo por rol', () => {
  const dir = path.join(agente, 'config', 'agentes');
  const esperadas = {
    producto: ['Read, Grep, Glob', 'sonnet'], arquitectura: ['Read, Grep, Glob', 'inherit'],
    desarrollo: ['Read, Grep, Glob, Bash, Edit, Write', 'sonnet'], calidad: ['Read, Grep, Glob, Bash', 'sonnet'],
    seguridad: ['Read, Grep, Glob, Bash', 'inherit'], diseno: ['Read, Grep, Glob, Bash', 'sonnet'],
  };
  for (const [rol, [tools, model]] of Object.entries(esperadas)) {
    const texto = fs.readFileSync(path.join(dir, `equipo-${rol}.md`), 'utf8');
    const cabecera = Object.fromEntries(texto.match(/^---\n([\s\S]*?)\n---\n/)[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
    assert.equal(cabecera.name, `equipo-${rol}`);
    assert.ok(cabecera.description.length > 20);
    assert.equal(cabecera.tools, tools, rol);
    assert.equal(cabecera.model, model, rol);
    assert.match(texto, /PREGUNTAS PARA EL DIRECTOR/, rol);
    if (rol === 'calidad' || rol === 'seguridad') {
      assert.match(texto, /VEREDICTO: APROBADO/);
      assert.match(texto, /VEREDICTO: BLOQUEADO/);
      assert.match(texto, /no modificas archivos ni haces commits/i);
    }
  }
});

test('perfiles: lista cerrada; el Director menciona a su equipo y el veto', () => {
  assert.deepEqual(PERFILES, ['director']);
  const texto = leerPerfil(agente, 'director');
  assert.match(texto, /^# Perfil: Director IA de NullRaptor/);
  for (const rol of ['producto', 'arquitectura', 'desarrollo', 'calidad', 'seguridad', 'diseno']) assert.ok(texto.includes(`equipo-${rol}`), rol);
  assert.match(texto, /VEREDICTO: APROBADO/);
  for (const malo of ['../../etc/passwd', 'Director', '', undefined]) assert.throws(() => leerPerfil(agente, malo), (e) => e.codigo === 400);
});

test('codex-parche: solo archivos del proyecto y sin secretos; encargo y diff', () => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'parche-'));
  fs.writeFileSync(path.join(raiz, 'a.mjs'), 'export const a = 1;\n');
  assert.equal(rutaDentro(raiz, './src/../a.mjs'), 'a.mjs');
  for (const malo of ['../fuera.txt', '/etc/passwd', '.env', 'conf/.env.local', 'claves/id_ed25519', '.git/config', 'x/servidor.pem']) assert.throws(() => rutaDentro(raiz, malo), malo);
  const archivos = leerArchivos(raiz, ['a.mjs', 'nuevo.mjs']);
  assert.deepEqual(archivos, [{ ruta: 'a.mjs', texto: 'export const a = 1;\n' }, { ruta: 'nuevo.mjs', texto: null }]);
  const encargo = construirEncargo({ encargo: 'Cambia a por 2', archivos });
  assert.match(encargo, /=== a\.mjs\nexport const a = 1;/);
  assert.match(encargo, /=== nuevo\.mjs \(no existe/);
  assert.match(encargo, /No ejecutes órdenes/);
  const diff = 'diff --git a/a.mjs b/a.mjs\n--- a/a.mjs\n+++ b/a.mjs\n@@ -1 +1 @@\n-export const a = 1;\n+export const a = 2;';
  assert.equal(extraerDiff(`Aquí va:\n\`\`\`diff\n${diff}\n\`\`\`\n`), `${diff}\n`);
  assert.equal(extraerDiff(diff), `${diff}\n`);
  assert.equal(extraerDiff('NO PUEDO: falta el archivo b'), null);
  assert.match(construirEncargo({ revisar: true, diff, archivos: [], encargo: '' }), /Sin objeciones/);
});

test('codex-parche: --probar implica aplicar; las salidas largas se recortan y el resto va a un archivo', async () => {
  const { leerArgumentos, recortar } = await import('../scripts/codex-parche.mjs');
  const { opciones, rutas, probar } = leerArgumentos(['--probar', 'npm test', 'a.mjs', 'b.mjs']);
  assert.ok(opciones.has('--aplicar'));
  assert.deepEqual(rutas, ['a.mjs', 'b.mjs']);
  assert.equal(probar, 'npm test');
  assert.throws(() => leerArgumentos(['--probar']), /necesita la orden/);
  assert.equal(leerArgumentos(['a.mjs']).probar, null);
  assert.equal(recortar('una\ndos', 15), 'una\ndos');
  let guardado = null;
  const largo = Array.from({ length: 40 }, (_, i) => `línea ${i + 1}`).join('\n');
  const corto = recortar(largo, 15, (t) => { guardado = t; return '/tmp/x.txt'; });
  assert.equal(guardado, largo);
  assert.match(corto, /^… \(25 líneas antes; completo en \/tmp\/x\.txt\)\nlínea 26\n/);
  assert.ok(corto.endsWith('línea 40'));
});

test('prepararIA aplica el ahorro de tokens en settings.json sin perder lo demás', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ia-ahorro-'));
  const configDir = path.join(base, '.claude');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'settings.json'), JSON.stringify({ theme: 'dark', model: 'opus', env: { MIO: '1', BASH_MAX_OUTPUT_LENGTH: '99999' } }));
  prepararIA({ agente, env: { CLAUDE_CONFIG_DIR: configDir }, memoria: null, trabajo: path.join(base, 'trabajo') });
  const s = JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8'));
  assert.equal(s.theme, 'dark');
  assert.equal(s.model, 'opusplan');
  assert.equal(s.env.MIO, '1');
  assert.deepEqual({ ...s.env, MIO: undefined }, { ...AHORRO.env, MIO: undefined });
  assert.deepEqual(conAhorro('no es un objeto'), { model: 'opusplan', env: AHORRO.env });
  // Sin settings.json (o roto), se crea.
  fs.writeFileSync(path.join(configDir, 'settings.json'), '{roto');
  prepararIA({ agente, env: { CLAUDE_CONFIG_DIR: configDir }, memoria: null, trabajo: path.join(base, 'trabajo') });
  assert.equal(JSON.parse(fs.readFileSync(path.join(configDir, 'settings.json'), 'utf8')).model, 'opusplan');
});
