// Simulador de verificación: tarda 5 minutos sin hacer nada útil. Sirve para
// comprobar la cancelación y la recuperación tras una interrupción.
import fs from 'node:fs';

fs.readFileSync(0, 'utf8');
console.log('model: simulador-lento');
await new Promise((resolve) => setTimeout(resolve, 5 * 60_000));
