// Simulación de fuerzas del grafo de la bóveda (sin dependencias): las notas se repelen, cada enlace tira como un
// muelle y un poco de gravedad las mantiene en el centro. «alfa» es la energía: baja en cada paso hasta pararse, y
// se recalienta al arrastrar un nodo. Pensado para cientos de notas (la repulsión es O(n²)).

const REPULSION = 260;
const LARGO = 70; // longitud de reposo de un enlace
const MUELLE = 0.09;
const GRAVEDAD = 0.035;
const FRENO = 0.58; // lo que queda de la velocidad tras cada paso
const ENFRIAR = 0.982;
export const ALFA_MIN = 0.004;

/** Prepara los nodos (posición inicial en espiral, estable entre cargas) y los enlaces por índice. */
export function crearSimulacion(nodos, aristas) {
  const indice = new Map(nodos.map((n, i) => [n.id, i]));
  const n = nodos.map((nodo, i) => {
    // Espiral de Fermat: reparte sin solapes y sin azar (la misma bóveda se ve igual al recargar).
    const r = 12 * Math.sqrt(i + 0.5);
    const a = i * 2.399963;
    return { ...nodo, x: r * Math.cos(a), y: r * Math.sin(a), vx: 0, vy: 0, grado: 0, fijo: false };
  });
  const enlaces = [];
  for (const a of aristas) {
    const o = indice.get(a.origen);
    const d = indice.get(a.destino);
    if (o === undefined || d === undefined || o === d) continue;
    enlaces.push([o, d]);
    n[o].grado += 1;
    n[d].grado += 1;
  }
  const vecinos = n.map(() => new Set());
  for (const [o, d] of enlaces) { vecinos[o].add(d); vecinos[d].add(o); }
  return { nodos: n, enlaces, vecinos, alfa: 1 };
}

/** Un paso de la simulación. Devuelve false cuando ya está quieta. */
export function paso(sim) {
  const { nodos, enlaces } = sim;
  if (sim.alfa < ALFA_MIN) return false;
  const alfa = sim.alfa;
  for (let i = 0; i < nodos.length; i++) {
    const a = nodos[i];
    for (let j = i + 1; j < nodos.length; j++) {
      const b = nodos[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) { dx = (i - j) * 0.01; dy = 0.01; d2 = dx * dx + dy * dy; } // encima: se separan
      if (d2 > 250000) continue; // a más de 500 no se notan
      const f = (REPULSION * alfa) / d2;
      a.vx -= dx * f; a.vy -= dy * f;
      b.vx += dx * f; b.vy += dy * f;
    }
  }
  for (const [o, d] of enlaces) {
    const a = nodos[o];
    const b = nodos[d];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    // Los nodos con muchos enlaces se mueven menos (como en d3): si no, los centros vibran.
    const f = ((dist - LARGO) / dist) * MUELLE * alfa;
    const pa = 1 / Math.max(1, a.grado);
    const pb = 1 / Math.max(1, b.grado);
    a.vx += dx * f * pb; a.vy += dy * f * pb;
    b.vx -= dx * f * pa; b.vy -= dy * f * pa;
  }
  for (const p of nodos) {
    if (p.fijo) { p.vx = 0; p.vy = 0; continue; }
    // Las notas sueltas (sin enlaces) se atraen más: si no, la repulsión las deja en un anillo lejano.
    const g = GRAVEDAD * alfa * (p.grado ? 1 : 3);
    p.vx -= p.x * g;
    p.vy -= p.y * g;
    p.vx *= FRENO; p.vy *= FRENO;
    p.x += p.vx; p.y += p.vy;
  }
  sim.alfa *= ENFRIAR;
  return true;
}

/** Recalienta (al arrastrar un nodo o al cambiar los datos). */
export function recalentar(sim, alfa = 0.3) { sim.alfa = Math.max(sim.alfa, alfa); }

/** Nodo bajo un punto del mundo (el de radio mayor si hay varios), o -1. */
export function nodoEn(sim, x, y, radio, holgura = 4) {
  let mejor = -1;
  let mejorD = Infinity;
  sim.nodos.forEach((p, i) => {
    const r = radio(p) + holgura;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d <= r * r && d < mejorD) { mejor = i; mejorD = d; }
  });
  return mejor;
}

/** Radio de un nodo según sus conexiones. */
export const radioDe = (p) => 3.2 + Math.sqrt(p.grado) * 1.9;

/** Un color por carpeta de primer nivel (en orden alfabético, para que no cambie entre cargas); la raíz, blanca. */
const PALETA = ['#b5f23d', '#7fa8ff', '#e8946f', '#c48cff', '#4fd1c5', '#fbbf24', '#f472b6', '#94a3b8'];
export function asignarColores(nodos) {
  const carpetas = [...new Set(nodos.filter((n) => !n.fantasma && n.carpeta).map((n) => n.carpeta))].sort((a, b) => a.localeCompare(b, 'es'));
  const colores = new Map([['', '#e8ece9']]);
  carpetas.forEach((c, i) => colores.set(c, PALETA[i % PALETA.length]));
  return colores;
}
