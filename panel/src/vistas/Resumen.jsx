// Resumen: todo de un vistazo — sesiones abiertas, proyectos y su flujo, la bóveda (buscar y últimos cambios),
// chats, MCP del día, las tareas de la IA (Ruflo) y el relevo a Codex cuando Claude se queda sin tokens.
import { ArrowDownUp, Check, MonitorSmartphone, SquareTerminal } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { put, useDatos } from '../api.js';
import { enlaceTerminal } from '../componentes/Sesiones.jsx';
import { Cabecera, Cargando, Fallo } from '../componentes/ui.jsx';
import { hojas, moverHoja, validarLocal } from './resumen/arbol.js';
import Motor from './resumen/Motor.jsx';
import { guardarOptimista } from './resumen/orden.js';
import { WIDGETS } from './resumen/registro.jsx';
import { CopiaSeguridad, RelevoCodex } from './resumen/tarjetas.jsx';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

export default function Resumen() {
  const { datos, error, cargando } = useDatos('/api/resumen', { cada: 5000 });
  const vistas = useDatos('/api/vistas');
  const [local, setLocal] = useState(null);
  const [reordenar, setReordenar] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState(null);
  const focoPendiente = useRef(null);
  // Tras mover una tarjeta, el foco vuelve al mismo botón de esa tarjeta (el reordenado del DOM lo pierde).
  useLayoutEffect(() => {
    if (!focoPendiente.current) return;
    const { id, dir } = focoPendiente.current;
    focoPendiente.current = null;
    document.querySelector(`[data-hoja="${id}"] [data-mando="${dir}"]`)?.focus();
  });
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;

  const { remoto = [], relevos = [], copias = null } = datos;
  const doc = vistas.datos;
  const vista = doc?.vistas?.find((v) => v.id === doc.inicio) ?? doc?.vistas?.[0];
  const raiz = local ?? vista?.raiz;
  const invalida = raiz ? validarLocal(raiz) : null;

  // Guardado optimista: se actualiza ya y, si el PUT falla, se vuelve a la raíz anterior.
  const onMover = (id, delta) => {
    const ids = hojas(raiz).filter((h) => WIDGETS[h.tipo]?.visible(datos)).map((h) => h.id);
    const nuevo = moverHoja(raiz, id, delta, ids);
    if (nuevo === raiz) return;
    focoPendiente.current = { id, dir: delta < 0 ? 'subir' : 'bajar' };
    const guardar = (r) => put('/api/vistas', { ...doc, vistas: doc.vistas.map((v) => (v === vista ? { ...v, raiz: r } : v)) });
    guardarOptimista({ orden: raiz, nuevo, guardar, setLocal, setError: setErrorGuardar });
  };
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo={`${saludo()}, Dano`} subtitulo={<span className="capitalize">{fecha}</span>}>
          <button type="button" aria-pressed={reordenar} onClick={() => setReordenar((v) => !v)} className={`flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] hover:text-raptor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raptor ${reordenar ? 'border-raptor bg-raptor/15 text-raptor' : 'border-borde text-tenue'}`}>
            {reordenar ? <Check className="size-4" /> : <ArrowDownUp className="size-4" />}{reordenar ? 'Listo' : 'Reordenar'}
          </button>
        </Cabecera>
        {reordenar && <p className="mt-2 text-[13px] text-tenue">Usa las flechas para ordenar las tarjetas. Los cambios se guardan solos</p>}
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

        {raiz && !invalida ? <Motor raiz={raiz} datos={datos} reordenar={reordenar} onMover={onMover} /> : (
          <div className="mt-6">
            {vistas.cargando && !vistas.datos ? <Cargando /> : <Fallo error={vistas.error ?? new Error(invalida ?? 'No se pudo cargar la vista.')} />}
            {!vistas.cargando && <button type="button" onClick={vistas.recargar} className="mt-3 min-h-9 rounded-lg border border-borde px-3 text-[13px] text-tenue hover:text-raptor focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-raptor">Reintentar</button>}
          </div>
        )}
      </div>
    </div>
  );
}
