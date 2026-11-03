// Grafo de la bóveda, como el de Obsidian: cada nota es un punto (color por carpeta, tamaño por conexiones) y cada
// [[enlace]] una línea. Se mueve con el ratón o el dedo: arrastrar el fondo desplaza, la rueda o dos dedos acercan,
// arrastrar un punto lo mueve y un clic abre la nota. Al pasar por encima se resaltan la nota y sus vecinas.
// Dibujo en canvas; la física está en ../grafo.js.
import { Crosshair, Ghost } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { asignarColores, crearSimulacion, nodoEn, paso, radioDe, recalentar } from '../grafo.js';
import { cx } from './ui.jsx';

const K_MIN = 0.12;
const K_MAX = 6;
const leer = (clave, defecto) => { try { const v = localStorage.getItem(clave); return v === null ? defecto : v === '1'; } catch { return defecto; } };

export default function Grafo({ datos, actual = null, alAbrir, className }) {
  const lienzo = useRef(null);
  const caja = useRef(null);
  const [fantasmas, setFantasmas] = useState(() => leer('boveda.fantasmas', true));
  // Estado que cambia en cada fotograma: en una ref, sin repintar React.
  const e = useRef({ cam: { x: 0, y: 0, k: 1 }, encima: -1, arrastre: null, punteros: new Map(), pellizco: null, ancho: 0, alto: 0, tocado: false, raf: 0, sim: null });

  const filtrados = useMemo(() => {
    if (!datos) return null;
    if (fantasmas) return datos;
    const nodos = datos.nodos.filter((n) => !n.fantasma);
    const ids = new Set(nodos.map((n) => n.id));
    return { nodos, aristas: datos.aristas.filter((a) => ids.has(a.origen) && ids.has(a.destino)) };
  }, [datos, fantasmas]);
  const colores = useMemo(() => asignarColores(datos?.nodos ?? []), [datos]);

  // Simulación nueva al cambiar los datos, conservando dónde estaba cada nota (la bóveda se recarga cada 30 s).
  const sim = useMemo(() => {
    if (!filtrados) return null;
    const previa = e.current.sim;
    const s = crearSimulacion(filtrados.nodos, filtrados.aristas);
    if (previa) {
      const antes = new Map(previa.nodos.map((p) => [p.id, p]));
      let conocidos = 0;
      for (const p of s.nodos) { const a = antes.get(p.id); if (a) { p.x = a.x; p.y = a.y; conocidos += 1; } }
      if (conocidos === s.nodos.length && s.enlaces.length === previa.enlaces.length) s.alfa = 0; // nada nuevo
      else if (conocidos > s.nodos.length / 2) s.alfa = 0.3;
    }
    e.current.sim = s;
    e.current.encima = -1;
    return s;
  }, [filtrados]);

  const dibujar = useCallback(() => {
    const c = lienzo.current;
    const s = e.current.sim;
    if (!c || !s) return;
    const { cam, ancho, alto } = e.current;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    const cx0 = ancho / 2 + cam.x;
    const cy0 = alto / 2 + cam.y;
    const foco = e.current.encima;
    const vecinos = foco >= 0 ? s.vecinos[foco] : null;
    const visible = (i) => foco < 0 || i === foco || vecinos.has(i);

    ctx.save();
    ctx.translate(cx0, cy0);
    ctx.scale(cam.k, cam.k);
    ctx.lineWidth = 1 / cam.k;
    for (const [o, d] of s.enlaces) {
      const a = s.nodos[o];
      const b = s.nodos[d];
      const resaltada = foco >= 0 && (o === foco || d === foco);
      ctx.strokeStyle = resaltada ? 'rgba(181,242,61,0.7)' : foco >= 0 ? 'rgba(154,163,157,0.06)' : 'rgba(154,163,157,0.26)';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    s.nodos.forEach((p, i) => {
      const r = radioDe(p);
      ctx.globalAlpha = visible(i) ? 1 : 0.15;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (p.fantasma) { ctx.strokeStyle = '#6b746e'; ctx.lineWidth = 1.3 / cam.k; ctx.stroke(); }
      else { ctx.fillStyle = colores.get(p.carpeta) ?? '#e8ece9'; ctx.fill(); }
      if (p.id === actual || i === foco) {
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 3 / cam.k, 0, Math.PI * 2);
        ctx.strokeStyle = '#b5f23d'; ctx.lineWidth = 1.6 / cam.k; ctx.stroke();
      }
    });
    ctx.restore();

    // Etiquetas en coordenadas de pantalla (nítidas a cualquier zoom): todas de cerca; de lejos, solo las notas con
    // muchas conexiones, la abierta y, al pasar por encima, la nota y sus vecinas.
    ctx.font = '500 11px Inter, ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    s.nodos.forEach((p, i) => {
      const destacada = i === foco || p.id === actual || (vecinos?.has(i) ?? false);
      // Cuanto más cerca, más nombres: las notas muy conectadas se ven ya de lejos (como en Obsidian).
      if (!destacada && (foco >= 0 || !(cam.k >= 1.3 || p.grado * cam.k >= 4))) return;
      const x = cx0 + p.x * cam.k;
      const y = cy0 + p.y * cam.k + radioDe(p) * cam.k + 4;
      if (x < -100 || x > ancho + 100 || y < -20 || y > alto + 20) return;
      const texto = p.nombre.length > 32 ? `${p.nombre.slice(0, 31)}…` : p.nombre;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,11,0.9)'; ctx.strokeText(texto, x, y);
      ctx.fillStyle = i === foco ? '#ffffff' : p.fantasma ? '#6b746e' : destacada ? '#e8ece9' : '#9aa39d';
      ctx.fillText(texto, x, y);
    });
  }, [colores, actual]);

  // Bucle de animación: corre mientras la física se mueve o se interactúa; si no, se para (no gasta CPU).
  const despertar = useCallback(() => {
    if (e.current.raf) return;
    const bucle = () => {
      const s = e.current.sim;
      const moviendo = s ? paso(s) : false;
      if (s && moviendo && s.alfa > 0.3) paso(s); // al principio, dos pasos por fotograma
      if (s && !e.current.tocado && s.alfa < 0.08) { centrar(); e.current.tocado = true; }
      dibujar();
      e.current.raf = moviendo || e.current.arrastre || e.current.pellizco ? requestAnimationFrame(bucle) : 0;
    };
    e.current.raf = requestAnimationFrame(bucle);
  }, [dibujar]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Encaja todo el grafo en la vista. */
  const centrar = useCallback(() => {
    const s = e.current.sim;
    const { ancho, alto } = e.current;
    if (!s?.nodos.length || !ancho) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const p of s.nodos) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const k = Math.min(K_MAX, Math.max(K_MIN, Math.min((ancho - 80) / Math.max(1, x1 - x0), (alto - 80) / Math.max(1, y1 - y0))));
    e.current.cam = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
  }, []);

  useEffect(() => { despertar(); }, [sim, despertar]);
  useEffect(() => () => cancelAnimationFrame(e.current.raf), []);

  // Tamaño: el canvas sigue a su caja (y a la densidad de píxeles de la pantalla).
  useEffect(() => {
    const el = caja.current;
    const c = lienzo.current;
    if (!el || !c) return undefined;
    const ajustar = () => {
      const { width, height } = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      e.current.ancho = width; e.current.alto = height;
      c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
      c.style.width = `${width}px`; c.style.height = `${height}px`;
      dibujar();
    };
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    ajustar();
    return () => ro.disconnect();
  }, [dibujar]);

  // Coordenadas: pantalla (relativas al canvas) ↔ mundo de la simulación.
  const punto = (ev) => { const r = lienzo.current.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  const aMundo = ({ x, y }) => { const { cam, ancho, alto } = e.current; return { x: (x - ancho / 2 - cam.x) / cam.k, y: (y - alto / 2 - cam.y) / cam.k }; };
  const acercar = (factor, { x, y }) => {
    const { cam, ancho, alto } = e.current;
    const k = Math.min(K_MAX, Math.max(K_MIN, cam.k * factor));
    const w = aMundo({ x, y });
    e.current.cam = { k, x: x - ancho / 2 - w.x * k, y: y - alto / 2 - w.y * k };
    e.current.tocado = true;
  };

  // La rueda necesita un oyente no pasivo para que la página no se desplace a la vez.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return undefined;
    const rueda = (ev) => { ev.preventDefault(); acercar(Math.exp(-ev.deltaY * 0.0015), punto(ev)); dibujar(); };
    c.addEventListener('wheel', rueda, { passive: false });
    return () => c.removeEventListener('wheel', rueda);
  }, [dibujar]); // eslint-disable-line react-hooks/exhaustive-deps

  const abajo = (ev) => {
    const s = e.current.sim;
    if (!s) return;
    lienzo.current.setPointerCapture(ev.pointerId);
    const p = punto(ev);
    e.current.punteros.set(ev.pointerId, p);
    if (e.current.punteros.size === 2) {
      const [a, b] = [...e.current.punteros.values()];
      e.current.pellizco = { d: Math.hypot(a.x - b.x, a.y - b.y), k: e.current.cam.k };
      if (e.current.arrastre?.tipo === 'nodo') s.nodos[e.current.arrastre.i].fijo = false;
      e.current.arrastre = null;
      return;
    }
    const w = aMundo(p);
    const i = nodoEn(s, w.x, w.y, radioDe, 6 / e.current.cam.k);
    e.current.arrastre = i >= 0 ? { tipo: 'nodo', i, inicio: p, movido: false } : { tipo: 'fondo', inicio: p, cam: { ...e.current.cam }, movido: false };
    if (i >= 0) { s.nodos[i].fijo = true; e.current.encima = i; }
    despertar();
  };

  const mover = (ev) => {
    const s = e.current.sim;
    if (!s) return;
    const p = punto(ev);
    if (e.current.punteros.has(ev.pointerId)) e.current.punteros.set(ev.pointerId, p);
    const { arrastre, pellizco } = e.current;
    if (pellizco && e.current.punteros.size === 2) {
      const [a, b] = [...e.current.punteros.values()];
      const factor = (pellizco.k * (Math.hypot(a.x - b.x, a.y - b.y) / pellizco.d)) / e.current.cam.k;
      acercar(factor, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (arrastre) {
      if (Math.hypot(p.x - arrastre.inicio.x, p.y - arrastre.inicio.y) > 4) arrastre.movido = true;
      if (!arrastre.movido) return;
      e.current.tocado = true;
      if (arrastre.tipo === 'nodo') {
        const w = aMundo(p);
        const n = s.nodos[arrastre.i];
        n.x = w.x; n.y = w.y;
        recalentar(s, 0.25);
      } else {
        e.current.cam = { ...arrastre.cam, x: arrastre.cam.x + p.x - arrastre.inicio.x, y: arrastre.cam.y + p.y - arrastre.inicio.y };
      }
      despertar();
      return;
    }
    if (ev.pointerType !== 'mouse') return;
    const w = aMundo(p);
    const i = nodoEn(s, w.x, w.y, radioDe, 4 / e.current.cam.k);
    if (i !== e.current.encima) {
      e.current.encima = i;
      lienzo.current.style.cursor = i >= 0 ? (s.nodos[i].fantasma ? 'default' : 'pointer') : 'grab';
      dibujar();
    }
  };

  const arriba = (ev) => {
    const s = e.current.sim;
    e.current.punteros.delete(ev.pointerId);
    if (e.current.punteros.size < 2) e.current.pellizco = null;
    const a = e.current.arrastre;
    e.current.arrastre = null;
    if (!a || !s) return;
    if (a.tipo === 'nodo') {
      s.nodos[a.i].fijo = false;
      const n = s.nodos[a.i];
      if (!a.movido && !n.fantasma) alAbrir?.(n.id);
      if (ev.pointerType !== 'mouse') e.current.encima = -1;
    } else if (!a.movido) e.current.encima = -1;
    dibujar();
  };

  const leyenda = useMemo(() => {
    const cuenta = new Map();
    for (const n of datos?.nodos ?? []) if (!n.fantasma) cuenta.set(n.carpeta, (cuenta.get(n.carpeta) ?? 0) + 1);
    return [...cuenta.entries()].sort(([a], [b]) => (a ? a.localeCompare(b, 'es') : -1));
  }, [datos]);

  const alternarFantasmas = () => {
    setFantasmas((v) => { try { localStorage.setItem('boveda.fantasmas', v ? '0' : '1'); } catch { /* sin almacenamiento */ } return !v; });
  };

  return (
    <div ref={caja} className={cx('relative h-full w-full overflow-hidden bg-fondo', className)}>
      <canvas
        ref={lienzo}
        role="img"
        aria-label={datos ? `Grafo de la bóveda: ${datos.nodos.length} notas y ${datos.aristas.length} conexiones` : 'Grafo de la bóveda'}
        className="block cursor-grab touch-none select-none"
        onPointerDown={abajo}
        onPointerMove={mover}
        onPointerUp={arriba}
        onPointerCancel={arriba}
        onPointerLeave={(ev) => { if (ev.pointerType === 'mouse' && !e.current.arrastre && e.current.encima >= 0) { e.current.encima = -1; dibujar(); } }}
      />
      <div className="absolute top-3 right-3 flex gap-1.5">
        <button type="button" onClick={alternarFantasmas} aria-pressed={fantasmas} title="Notas enlazadas que aún no existen"
          className={cx('flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] backdrop-blur', fantasmas ? 'border-borde-fuerte bg-elevado/80 text-texto' : 'border-borde bg-panel/70 text-apagado')}>
          <Ghost className="size-3.5" /> Fantasmas
        </button>
        <button type="button" onClick={() => { centrar(); e.current.tocado = true; dibujar(); }} title="Encajar todo el grafo"
          className="flex h-8 items-center gap-1.5 rounded-lg border border-borde-fuerte bg-elevado/80 px-2.5 text-[12px] text-texto backdrop-blur hover:border-raptor/40">
          <Crosshair className="size-3.5" /> Centrar
        </button>
      </div>
      {leyenda.length > 0 && (
        <ul className="pointer-events-none absolute bottom-3 left-3 space-y-1 rounded-xl border border-borde bg-panel/75 px-3 py-2 text-[11px] text-tenue backdrop-blur">
          {leyenda.map(([carpeta, n]) => (
            <li key={carpeta || '(raíz)'} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: colores.get(carpeta) }} />
              <span className="flex-1">{carpeta || 'Raíz'}</span>
              <span className="tabular-nums text-apagado">{n}</span>
            </li>
          ))}
          {fantasmas && datos?.nodos.some((n) => n.fantasma) && (
            <li className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-apagado" /><span className="flex-1">Sin crear</span><span className="tabular-nums text-apagado">{datos.nodos.filter((n) => n.fantasma).length}</span></li>
          )}
        </ul>
      )}
      <p className="pointer-events-none absolute right-3 bottom-3 hidden text-[11px] text-apagado sm:block">Arrastra para moverte · rueda para acercar · clic para abrir</p>
    </div>
  );
}
