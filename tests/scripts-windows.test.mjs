// Scripts de Windows: PowerShell 5.1 necesita UTF-8 con una sola marca BOM (sin ella lee mal los acentos; con dos,
// la segunda queda como carácter suelto delante de la primera línea, «param(...)» deja de ser lo primero y los
// modificadores como -Actualizar se pierden: la tarea programada hacía un arranque normal).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SCRIPTS = path.join(import.meta.dirname, '..', 'scripts');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

test('los .ps1 llevan exactamente un BOM y son UTF-8 válido', () => {
  const archivos = fs.readdirSync(SCRIPTS).filter((n) => n.endsWith('.ps1'));
  assert.ok(archivos.length >= 3);
  for (const n of archivos) {
    const b = fs.readFileSync(path.join(SCRIPTS, n));
    assert.ok(b.subarray(0, 3).equals(BOM), `${n}: sin BOM`);
    assert.ok(!b.subarray(3, 6).equals(BOM), `${n}: BOM repetido`);
    assert.doesNotThrow(() => new TextDecoder('utf-8', { fatal: true }).decode(b), `${n}: no es UTF-8`);
  }
});
