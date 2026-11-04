// Gasto de tokens de Claude Code (panel/lib/gasto.mjs): lectura de los registros y resumen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gasto, llamadasDe, proyectoDe, resumirGasto } from '../panel/lib/gasto.mjs';

const linea = (id, dia, modelo, u, extra = {}) => JSON.stringify({ requestId: `r${id}`, timestamp: `${dia}T10:00:00Z`, message: { id: `m${id}`, model: modelo, usage: u }, ...extra });

test('gasto: una llamada por respuesta, proyecto por carpeta, partes y contexto; relee solo lo que cambia', () => {
  assert.equal(proyectoDe('-estado-trabajo-proyectos-Modelos3D'), 'Modelos3D');
  assert.equal(proyectoDe('-estado-trabajo-nullraptor'), 'Nullraptor');
  const u = { input_tokens: 10, cache_creation_input_tokens: 1000, cache_read_input_tokens: 100_000, output_tokens: 500 };
  const texto = [linea(1, '2026-11-04', 'claude-opus-5-5', u), linea(1, '2026-11-04', 'claude-opus-5-5', u), 'no es json',
    linea(2, '2026-11-03', 'claude-sonnet-5-5', { ...u, cache_read_input_tokens: 0 }), linea(3, '2026-11-04', '<synthetic>', u)].join('\n');
  const ll = llamadasDe(texto);
  assert.equal(ll.length, 2); // repetida y sintética fuera
  const r = resumirGasto(ll.map((l) => ({ ...l, proyecto: 'A' })), '2026-11-01');
  assert.equal(r.llamadas, 2);
  assert.deepEqual(r.porModelo.map((m) => m.nombre), ['opus-5-5', 'sonnet-5-5']);
  assert.ok(r.partes.leer > r.partes.salida);
  assert.equal(r.contexto.p90, 101_010);
  assert.equal(resumirGasto(ll, '2026-12-01').llamadas, 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gasto-'));
  const carpeta = path.join(dir, '-estado-trabajo-proyectos-Roleplay', 'sesion', 'subagents');
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(dir, '-estado-trabajo-proyectos-Roleplay', 'a.jsonl'), texto);
  fs.writeFileSync(path.join(carpeta, 'b.jsonl'), linea(9, '2026-11-04', 'claude-haiku-5-5', u));
  const g = new Gasto({ dir, ahora: () => new Date('2026-11-04T12:00:00Z') });
  const r7 = g.resumen(7);
  assert.equal(r7.llamadas, 3);
  assert.deepEqual(r7.porProyecto.map((p) => p.nombre), ['Roleplay']);
  assert.equal(g.resumen(1).llamadas, 2); // solo hoy
  fs.appendFileSync(path.join(carpeta, 'b.jsonl'), `\n${linea(10, '2026-11-04', 'claude-haiku-5-5', u)}`);
  assert.equal(g.resumen(7).llamadas, 4);
  assert.equal(g.resumen('muchos').dias, 7);
});
