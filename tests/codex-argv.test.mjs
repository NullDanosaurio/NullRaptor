// Guardián: `codex exec` 0.163.0 ignora los -c/--config anteriores al subcomando (se perdían mcp_servers, instrucciones, roles).
import test from 'node:test';
import assert from 'node:assert/strict';
import { argsCodex } from '../scripts/relevo.mjs';

export const SUBCOMANDOS_EXEC = ['exec'];

/** Índice del primer subcomando de Codex en el argv (o -1). */
export const indiceSubcomando = (args, subs = SUBCOMANDOS_EXEC) => args.findIndex((a, i) => subs.includes(a) && (i === 0 || args[i - 1] !== '-c'));

/** Falla si hay -c/--config antes del subcomando. */
export function sinConfigAntesDelSubcomando(args, subs = SUBCOMANDOS_EXEC) {
  const i = indiceSubcomando(args, subs);
  assert.ok(i >= 0, 'el argv no tiene subcomando');
  const antes = args.slice(0, i);
  assert.ok(!antes.some((a) => a === '-c' || a === '--config' || a.startsWith('--config=')), `-c antes de «${args[i]}»: ${antes.join(' ').slice(0, 120)}`);
}

test('relevo: ningún -c antes de exec y toda la configuración (instrucciones, MCP, roles) después', () => {
  const configuracion = ['-c', 'mcp_servers={ "ruflo" = { "enabled" = true } }', '-c', 'developer_instructions="Hola"', '-c', 'agents={ max_threads = 3 }', '-c', 'features.multi_agent=true'];
  for (const sinSandbox of [false, true]) {
    const a = argsCodex({ cwd: '/p', dirRelevo: '/d', salida: '/s', configuracion, sinSandbox });
    assert.deepEqual(a.slice(0, 2), ['--no-daemon', 'exec']);
    sinConfigAntesDelSubcomando(a);
    const despues = a.slice(a.indexOf('exec'));
    for (const c of configuracion.filter((_, i) => i % 2)) assert.ok(despues.includes(c), c);
    assert.ok(despues.includes('default_permissions="nr"') === !sinSandbox);
  }
});

test('el guardián detecta un -c antes del subcomando', () => {
  assert.throws(() => sinConfigAntesDelSubcomando(['--no-daemon', '-c', 'x=1', 'exec', '--json']), /-c antes de «exec»/);
  assert.throws(() => sinConfigAntesDelSubcomando(['--no-daemon', '--config=x=1', 'exec']), /antes de/);
  sinConfigAntesDelSubcomando(['--no-daemon', 'exec', '-c', 'x=1']);
});
