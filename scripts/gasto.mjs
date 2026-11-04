// Gasto de tokens de Claude Code de los últimos días (panel/lib/gasto.mjs), en la terminal.
//   node scripts/gasto.mjs [días, por defecto 7]
import { Gasto } from '../panel/lib/gasto.mjs';

const r = new Gasto().resumen(process.argv[2] ?? 7);
const fila = (a) => `  ${a.nombre.padEnd(28)} ${String(a.pct).padStart(5)} %  ~${a.usd} USD  (${a.llamadas} llamadas)`;
console.log(`Gasto desde ${r.desde} (${r.dias} días): ~${r.usd} USD con precios de API, ${r.llamadas} llamadas`);
console.log(`Contexto por llamada: mediana ${r.contexto.mediana.toLocaleString('es-ES')} · p90 ${r.contexto.p90.toLocaleString('es-ES')} tokens`);
console.log(`Se va en: releer contexto ${r.partes.leer} % · contexto nuevo ${r.partes.escribir} % · respuestas ${r.partes.salida} % · entrada ${r.partes.entrada} %`);
console.log('Por modelo:'); r.porModelo.forEach((a) => console.log(fila(a)));
console.log('Por proyecto:'); r.porProyecto.forEach((a) => console.log(fila(a)));
console.log('Por día:'); r.porDia.forEach((a) => console.log(fila(a)));
