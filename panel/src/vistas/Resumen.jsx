// Resumen: todo de un vistazo — sesiones abiertas, proyectos y su flujo, la bóveda (buscar y últimos cambios),
// chats, MCP del día, las tareas de la IA (Ruflo) y el relevo a Codex cuando Claude se queda sin tokens.
import { ArrowDownUp, Check, MonitorSmartphone, SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { put, useDatos } from '../api.js';
import { enlaceTerminal } from '../componentes/Sesiones.jsx';
import { Cabecera, Cargando, Fallo } from '../componentes/ui.jsx';
import { mover, normalizar } from './resumen/orden.js';
import Rejilla from './resumen/Rejilla.jsx';
import { ORDEN_POR_DEFECTO, visibles } from './resumen/registro.jsx';
import { CopiaSeguridad, RelevoCodex } from './resumen/tarjetas.jsx';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export default function Resumen() {
  const { datos, error, cargando } = useDatos('/api/resumen', { cada: 5000 });
  const diseno = useDatos('/api/diseno');
  const [local, setLocal] = useState(null);
  const [reordenar, setReordenar] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(null);
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;

  const { remoto = [], relevos = [], copias = null } = datos;
  // Si el GET de /api/diseno falla, el orden por defecto.
  const orden = normalizar(local ?? diseno.datos?.orden ?? ORDEN_POR_DEFECTO, ORDEN_POR_DEFECTO);

  // Guardado optimista: se actualiza ya y, si el PUT falla, se vuelve al orden anterior.
  const onMover = (id, delta) => {
    const nuevo = mover(orden, id, delta, visibles(orden, datos));
    if (nuevo === orden) return;
    setErrorGuardar(null);
    setLocal(nuevo);
    put('/api/diseno', { orden: nuevo }).catch((e) => {
      setLocal((actual) => (actual === nuevo ? orden : actual));
      setErrorGuardar(e);
    });
  };
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo={`${saludo()}, Dano`} subtitulo={<span className="capitalize">{fecha}</span>}>
          <button type="button" aria-pressed={reordenar} onClick={() => setReordenar((v) => !v)} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-borde px-3 text-[13px] text-tenue hover:text-raptor">
            {reordenar ? <Check className="size-4" /> : <ArrowDownUp className="size-4" />}{reordenar ? 'Listo' : 'Reordenar'}
          </button>
        </Cabecera>
        <Fallo error={error} className="mb-4" />
        <Fallo error={errorGuardar} className="mb-4" />
        <RelevoCodex relevos={relevos} />
        <CopiaSeguridad copias={copias} />
        {remoto.length > 0 && (
          <div className="mb-4 rounded-xl border border-aviso/25 bg-aviso/10 px-3 py-2 text-[13px] text-aviso">
            <p className="flex items-center gap-2.5"><MonitorSmartphone className="size-4 shrink-0" />{remoto.length === 1 ? '1 sesión de desarrollo abierta' : `${remoto.length} sesiones de desarrollo abiertas`}</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {remoto.map((s) => (
                <li key={s.id}><a href={enlaceTerminal(s)} className="flex items-center gap-1.5 rounded-lg border border-aviso/25 px-2.5 py-1 hover:bg-aviso/15"><SquareTerminal className="size-3.5" /> {s.proyecto}</a></li>
              ))}
            </ul>
          </div>
        )}

        <Rejilla orden={orden} datos={datos} reordenar={reordenar} onMover={onMover} />
      </div>
    </div>
  );
}
