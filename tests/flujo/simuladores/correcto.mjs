// Simulador de verificación: escribe código válido en el primer archivo permitido.
// Sirve para probar el camino feliz (turno de Codex → «listo para revisar» → revisión e integración).
import fs from 'node:fs';
import path from 'node:path';

const entrada = fs.readFileSync(0, 'utf8');
const permitido = entrada.match(/SOLO estos archivos: (.+?)\. Cualquier/)?.[1]?.split(',')[0]?.trim();
if (!permitido) process.exit(1);
fs.mkdirSync(path.dirname(permitido), { recursive: true });
fs.writeFileSync(permitido, '/** Saludo de prueba del flujo. */\nexport const saludo = (nombre: string): string => `Hola, ${nombre}`;\n');
console.log(`model: simulador-correcto (intento ${process.env.FLUJO_INTENTO})`);
