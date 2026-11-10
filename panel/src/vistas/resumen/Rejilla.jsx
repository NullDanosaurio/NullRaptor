// Rejilla del Resumen: una sola lista ordenada (2 columnas en lg). En modo reordenar, cada tarjeta lleva sus
// botones de subir/bajar; la rejilla solo avisa con onMover(id, delta).
import { ArrowDown, ArrowUp } from 'lucide-react';
import { WIDGETS, visibles } from './registro.jsx';

const boton = 'grid size-9 place-items-center rounded-lg border border-borde bg-elevado text-tenue hover:text-raptor disabled:opacity-30 disabled:hover:text-tenue';

function Mando({ id, primero, ultimo, onMover }) {
  return (
    <div className="absolute right-2 top-2 z-10 flex gap-1.5">
      <button type="button" className={boton} disabled={primero} onClick={() => onMover(id, -1)} aria-label={`Subir la tarjeta ${id}`}><ArrowUp className="size-4" /></button>
      <button type="button" className={boton} disabled={ultimo} onClick={() => onMover(id, 1)} aria-label={`Bajar la tarjeta ${id}`}><ArrowDown className="size-4" /></button>
    </div>
  );
}

export default function Rejilla({ orden, datos, reordenar = false, onMover }) {
  const lista = visibles(orden, datos);
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      {lista.map((id, i) => {
        const { ancho, Componente } = WIDGETS[id];
        return (
          <div key={id} data-widget={id} className={`relative min-w-0 ${ancho === 2 ? 'lg:col-span-2' : ''} ${reordenar ? 'rounded-2xl outline-dashed outline-1 outline-raptor/40' : ''}`}>
            <Componente datos={datos} />
            {reordenar && <Mando id={id} primero={i === 0} ultimo={i === lista.length - 1} onMover={onMover} />}
          </div>
        );
      })}
    </div>
  );
}
