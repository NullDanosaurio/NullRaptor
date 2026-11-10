// Rejilla del Resumen: una sola lista ordenada (2 columnas en lg). En modo reordenar, cada tarjeta lleva sus
// botones de subir/bajar; la rejilla solo avisa con onMover(id, delta).
import { ArrowDown, ArrowUp } from 'lucide-react';
import { WIDGETS, visibles } from './registro.jsx';

const boton = 'grid size-11 place-items-center rounded-lg border border-borde bg-elevado text-tenue hover:text-raptor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raptor lg:size-9';
const off = 'opacity-40 cursor-not-allowed hover:text-tenue';

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

export default function Rejilla({ orden, datos, reordenar = false, onMover }) {
  const lista = visibles(orden, datos);
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {lista.map((id, i) => {
        const { ancho, titulo, Componente } = WIDGETS[id];
        return (
          <div key={id} data-widget={id} className={`min-w-0 ${ancho === 2 ? 'lg:col-span-2' : ''} ${reordenar ? 'rounded-2xl bg-raptor/5 outline-dashed outline-1 outline-raptor/60' : ''}`}>
            {reordenar && <Mando id={id} titulo={titulo} primero={i === 0} ultimo={i === lista.length - 1} onMover={onMover} />}
            <Componente datos={datos} />
          </div>
        );
      })}
    </div>
  );
}
