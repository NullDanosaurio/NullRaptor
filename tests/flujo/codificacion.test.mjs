// Pruebas del control de codificación del flujo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { problemasDeCodificacion } from '../../flujo/lib/comprobaciones.mjs';

test('detecta mojibake y archivos no UTF-8; acepta español correcto', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codif-'));
  fs.writeFileSync(path.join(dir, 'bien.css'), '/* decisión de diseño, no un ajuste técnico; ñ ¡ ¿ € — */\n');
  fs.writeFileSync(path.join(dir, 'mal.css'), '/* decisiÃ³n de diseÃ±o */\n');
  fs.writeFileSync(path.join(dir, 'ansi.ts'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  fs.writeFileSync(path.join(dir, 'imagen.png'), Buffer.from([0xff, 0xd8]));
  const problemas = problemasDeCodificacion(dir, ['bien.css', 'mal.css', 'ansi.ts', 'imagen.png', 'no-existe.ts']);
  assert.equal(problemas.length, 2);
  assert.match(problemas[0] ?? '', /^mal\.css:1: texto mal codificado/);
  assert.match(problemas[1] ?? '', /^ansi\.ts: no es UTF-8 válido/);
  fs.rmSync(dir, { recursive: true, force: true });
});
