import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sesionesCodex } from '../scripts/sesiones-codex.mjs';

const idDe = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`;
const linea = (id, cwd) => JSON.stringify({ type: 'session_meta', payload: { id, cwd, timestamp: '2026-11-06T12:00:00Z', source: 'cli' } });

test('sesionesCodex cachea por ruta y mtime, y lee primeras líneas de más de 64 KB', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cache-'));
  const dir = path.join(home, 'sessions', '2026', '11', '06');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 300; i++) fs.writeFileSync(path.join(dir, `${i}.jsonl`), `${linea(idDe(i), '/x')}\n`);
  const larga = path.join(dir, 'larga.jsonl');
  fs.writeFileSync(larga, `${linea(idDe(999), `/${'a'.repeat(100 * 1024)}`)}\n{"otra":1}\n`);
  const f = path.join(dir, '1.jsonl');
  const fijo = new Date('2026-11-06T12:00:00.000Z');
  fs.utimesSync(f, fijo, fijo); // mtime exacto al milisegundo
  const env = { CODEX_HOME: home };
  assert.equal(sesionesCodex(env).length, 301);
  assert.equal(sesionesCodex(env).find((s) => s.id === idDe(999)).cwd.length, 100 * 1024 + 1);

  // Mismo tamaño y mtime, contenido distinto: la caché lo devuelve sin reabrir el archivo.
  fs.writeFileSync(f, `${linea(idDe(5000), '/x')}\n`);
  fs.utimesSync(f, fijo, fijo);
  const ids = sesionesCodex(env).map((s) => s.id);
  assert.ok(ids.includes(idDe(1)) && !ids.includes(idDe(5000)));

  // Si cambia el mtime se relee; si el archivo desaparece, se olvida.
  fs.utimesSync(f, fijo, new Date(fijo.getTime() + 5000));
  assert.ok(sesionesCodex(env).some((s) => s.id === idDe(5000)));
  fs.rmSync(f);
  assert.equal(sesionesCodex(env).length, 300);
});
