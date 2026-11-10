// Motor de vistas: pinta el árbol recursivo con flex y pesos (flex-grow = peso del eje del padre). En móvil, una
// sola columna sin pesos. Cada hoja usa su componente del registro dentro de un ErrorBoundary.
import { AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { Component, useEffect, useState } from 'react';
import { podar } from './arbol.js';
import { WIDGETS } from './registro.jsx';

const boton = 'grid size-11 place-items-center rounded-lg border border-borde bg-elevado text-tenue hover:text-raptor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raptor lg:size-9';
const off = 'opacity-40 cursor-not-allowed hover:text-tenue';

/** Aísla el fallo de una tarjeta para que no tire el Resumen entero. */
export class ErrorBoundary extends Component {
  state = { fallo: null };
  static getDerivedStateFromError(fallo) { return { fallo }; }
  componentDidCatch(fallo) { console.error('Tarjeta con error:', fallo); }
  render() {
    if (!this.state.fallo) return this.props.children;
    return (
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-fallo/25 bg-fallo/10 px-3 py-2 text-[13px] text-fallo">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>Esta tarjeta ha fallado: {this.props.titulo}</span>
      </div>
    );
  }
}

/** true en pantallas anchas (lg, 1024 px). */
function useAncho() {
  const consulta = '(min-width: 1024px)';
  const [ancho, setAncho] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia(consulta);
    const cambio = () => setAncho(m.matches);
    cambio();
    m.addEventListener('change', cambio);
    return () => m.removeEventListener('change', cambio);
  }, []);
  return ancho;
}

function Mando({ id, titulo, primero, ultimo, onMover }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[12px] text-tenue">{titulo}</span>
      <div className="flex gap-2">
        <button type="button" data-mando="subir" className={`${boton} ${primero ? off : ''}`} aria-disabled={primero} onClick={() => { if (!primero) onMover(id, -1); }} aria-label={`Subir la tarjeta ${titulo}`}><ArrowUp className="size-4" /></button>
        <button type="button" data-mando="bajar" className={`${boton} ${ultimo ? off : ''}`} aria-disabled={ultimo} onClick={() => { if (!ultimo) onMover(id, 1); }} aria-label={`Bajar la tarjeta ${titulo}`}><ArrowDown className="size-4" /></button>
      </div>
    </div>
  );
}

function Hoja({ hoja, ctx, estilo }) {
  const def = WIDGETS[hoja.tipo];
  if (!def) return null;
  const { datos, reordenar, onMover, ids, ancho } = ctx;
  const i = ids.indexOf(hoja.id);
  return (
    <div data-widget={hoja.tipo} data-hoja={hoja.id} style={ancho ? estilo : undefined} className={`min-w-0 ${reordenar ? 'rounded-2xl bg-raptor/5 outline-dashed outline-1 outline-raptor/60' : ''}`}>
      {reordenar && <Mando id={hoja.id} titulo={def.titulo} primero={i === 0} ultimo={i === ids.length - 1} onMover={onMover} />}
      <ErrorBoundary titulo={def.titulo}><def.Componente datos={datos} ajustes={hoja.ajustes} /></ErrorBoundary>
    </div>
  );
}

function Nodo({ nodo, padre, ctx }) {
  // Solo cuenta el peso del eje del padre: fila → peso_h, col → peso_v.
  const peso = padre === 'fila' ? nodo.peso_h : padre === 'col' ? nodo.peso_v : 1;
  const estilo = { flex: padre === 'fila' ? `${peso} 1 0%` : `${peso} 1 auto`, minWidth: 0 };
  if (nodo.t === 'w') return <Hoja hoja={nodo} ctx={ctx} estilo={estilo} />;
  const dir = nodo.t === 'fila' && ctx.ancho ? 'flex-row' : 'flex-col';
  return (
    <div data-nodo={nodo.t} style={ctx.ancho ? estilo : undefined} className={`flex min-w-0 ${dir} gap-6`}>
      {nodo.hijos.map((h, i) => <Nodo key={h.id ?? i} nodo={h} padre={nodo.t} ctx={ctx} />)}
    </div>
  );
}

export default function Motor({ raiz, datos, reordenar = false, onMover }) {
  const ancho = useAncho();
  const visibleHoja = (h) => Boolean(WIDGETS[h.tipo]?.visible(datos));
  const poda = podar(raiz, visibleHoja);
  if (!poda) return null;
  const ids = [];
  (function recoger(n) { if (n.t === 'w') ids.push(n.id); else n.hijos.forEach(recoger); })(poda);
  return <div className="mt-6"><Nodo nodo={poda} padre={null} ctx={{ datos, reordenar, onMover, ids, ancho }} /></div>;
}
