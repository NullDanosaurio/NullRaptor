// Gasto de tokens de Claude Code, leído de sus registros locales (<CLAUDE_CONFIG_DIR>/projects/**/*.jsonl): por
// modelo, proyecto y día, de qué se compone (contexto releído, contexto nuevo, salida) y cuánto contexto lleva cada
// llamada. Sirve para ver en números si un cambio ahorra. Solo lectura; guarda lo leído y relee solo los archivos que
// cambian. El coste es una estimación con precios de API (no es lo que se paga con la suscripción, pero da la
// proporción). Uso suelto: node scripts/gasto.mjs [días].
import fs from 'node:fs';
import path from 'node:path';

// USD por millón de tokens de entrada; la salida cuesta 5×, escribir caché 1,25× y leerla 0,1×.
const PRECIO = [[/opus/, 5], [/sonnet/, 3], [/haiku/, 1]];
const precioDe = (modelo) => PRECIO.find(([re]) => re.test(modelo))?.[1] ?? 3;

/** Nombre del proyecto a partir de la carpeta de registros («-estado-trabajo-proyectos-Modelos3D» → «Modelos3D»). */
export function proyectoDe(carpeta) {
  const limpio = carpeta.replace(/^-estado-trabajo-proyectos-/, '').replace(/^-estado-trabajo-/, '').replace(/^-/, '');
  return limpio.toLowerCase() === 'nullraptor' ? 'Nullraptor' : limpio || '(otros)';
}

/** Llamadas de un .jsonl: [{ id, dia, modelo, entrada, escribe, lee, salida }] (una por respuesta). */
export function llamadasDe(texto) {
  const vistas = new Map();
  for (const linea of texto.split('\n')) {
    if (!linea.includes('"usage"')) continue;
    let j;
    try { j = JSON.parse(linea); } catch { continue; }
    const m = j.message;
    const u = m?.usage;
    if (!u || typeof m.model !== 'string' || m.model.startsWith('<')) continue;
    const id = `${m.id ?? ''}|${j.requestId ?? ''}`;
    // Una respuesta se apunta en varias líneas (una por bloque) con el mismo uso: vale la última.
    vistas.set(id, {
      id, dia: String(j.timestamp ?? '').slice(0, 10), modelo: m.model.replace(/^claude-/, ''),
      entrada: u.input_tokens ?? 0, escribe: u.cache_creation_input_tokens ?? 0, lee: u.cache_read_input_tokens ?? 0, salida: u.output_tokens ?? 0,
    });
  }
  return [...vistas.values()];
}

const costeDe = (l) => (precioDe(l.modelo) / 1e6) * (l.entrada + 1.25 * l.escribe + 0.1 * l.lee + 5 * l.salida);
const percentil = (ordenados, p) => (ordenados.length ? ordenados[Math.min(ordenados.length - 1, Math.floor(ordenados.length * p))] : 0);

/** Resumen de las llamadas desde `desde` (AAAA-MM-DD). `llamadas`: [{ ...llamada, proyecto }]. */
export function resumirGasto(llamadas, desde) {
  const dentro = llamadas.filter((l) => l.dia >= desde);
  const total = dentro.reduce((s, l) => s + costeDe(l), 0) || 1;
  const agrupar = (clave) => {
    const g = new Map();
    for (const l of dentro) {
      const k = l[clave];
      const a = g.get(k) ?? { nombre: k, usd: 0, llamadas: 0 };
      a.usd += costeDe(l); a.llamadas += 1;
      g.set(k, a);
    }
    return [...g.values()].map((a) => ({ ...a, usd: Math.round(a.usd * 100) / 100, pct: Math.round((1000 * a.usd) / total) / 10 }));
  };
  const partes = { leer: 0, escribir: 0, salida: 0, entrada: 0 };
  for (const l of dentro) {
    const p = precioDe(l.modelo) / 1e6;
    partes.leer += p * 0.1 * l.lee; partes.escribir += p * 1.25 * l.escribe; partes.salida += p * 5 * l.salida; partes.entrada += p * l.entrada;
  }
  const contextos = dentro.map((l) => l.entrada + l.escribe + l.lee).sort((a, b) => a - b);
  return {
    desde,
    llamadas: dentro.length,
    usd: Math.round((dentro.length ? total : 0) * 100) / 100,
    porModelo: agrupar('modelo').sort((a, b) => b.usd - a.usd),
    porProyecto: agrupar('proyecto').sort((a, b) => b.usd - a.usd),
    porDia: agrupar('dia').sort((a, b) => a.nombre.localeCompare(b.nombre)),
    partes: Object.fromEntries(Object.entries(partes).map(([k, v]) => [k, Math.round((1000 * v) / total) / 10])),
    contexto: { mediana: percentil(contextos, 0.5), p90: percentil(contextos, 0.9) },
  };
}

export class Gasto {
  constructor({ dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(process.env.HOME ?? '', '.claude'), 'projects'), ahora = () => new Date() } = {}) {
    Object.assign(this, { dir, ahora });
    this.archivos = new Map(); // ruta → { firma, llamadas }
  }

  #leerTodo() {
    const vistos = new Set();
    const recorrer = (carpeta, proyecto) => {
      let entradas = [];
      try { entradas = fs.readdirSync(carpeta, { withFileTypes: true }); } catch { return; }
      for (const e of entradas) {
        const ruta = path.join(carpeta, e.name);
        if (e.isDirectory()) { recorrer(ruta, proyecto ?? proyectoDe(e.name)); continue; }
        if (!e.name.endsWith('.jsonl')) continue;
        vistos.add(ruta);
        let st;
        try { st = fs.statSync(ruta); } catch { continue; }
        const firma = `${st.size}:${st.mtimeMs}`;
        if (this.archivos.get(ruta)?.firma === firma) continue;
        let texto = '';
        try { texto = fs.readFileSync(ruta, 'utf8'); } catch { continue; }
        this.archivos.set(ruta, { firma, llamadas: llamadasDe(texto).map((l) => ({ ...l, proyecto: proyecto ?? '(otros)' })) });
      }
    };
    recorrer(this.dir, null);
    for (const ruta of this.archivos.keys()) if (!vistos.has(ruta)) this.archivos.delete(ruta);
  }

  /** Resumen de los últimos `dias` días (hoy incluido). */
  resumen(dias = 7) {
    const n = Math.min(90, Math.max(1, Number.parseInt(dias, 10) || 7));
    this.#leerTodo();
    const desde = new Date(this.ahora().getTime() - (n - 1) * 86_400_000).toISOString().slice(0, 10);
    const todas = [...this.archivos.values()].flatMap((a) => a.llamadas);
    // La misma respuesta puede aparecer en dos archivos (sesión reanudada): se cuenta una vez.
    const unicas = [...new Map(todas.map((l) => [l.id, l])).values()];
    return { dias: n, ...resumirGasto(unicas, desde) };
  }
}
