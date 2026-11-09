import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const leer = (n) => fs.readFileSync(fileURLToPath(new URL(`../${n}`, import.meta.url)), 'utf8');

test('el contenedor arranca con init (PID 1 recoge los zombis): compose.yaml y arrancar.ps1', () => {
  assert.match(leer('compose.yaml'), /^\s+init: true/m);
  assert.match(leer('scripts/arrancar.ps1'), /docker run -d --init --name /);
});
