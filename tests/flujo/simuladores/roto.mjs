// Simulador de verificación: escribe código con un error de tipos dentro del
// alcance permitido. Las comprobaciones deben fallar y el flujo debe reintentar
// y finalmente rechazar.
import fs from 'node:fs';
import path from 'node:path';

const entrada = fs.readFileSync(0, 'utf8');
const permitido = entrada.match(/SOLO estos archivos: (.+?)\. Cualquier/)?.[1]?.split(',')[0]?.trim();
if (!permitido) process.exit(1);
fs.mkdirSync(path.dirname(permitido), { recursive: true });
fs.writeFileSync(permitido, "export const roto: number = 'esto no es un número';\n");
console.log(`model: simulador-roto (intento ${process.env.FLUJO_INTENTO})`);
