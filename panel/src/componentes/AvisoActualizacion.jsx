// Aviso de versión nueva: la tarea de Windows la instala sola cuando no hay sesiones abiertas; si las hay, se espera
// a que Daniel pulse «Actualizar ahora» (cierra las sesiones y reinicia Nullraptor).
import { Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { post, useDatos } from '../api.js';
import { Boton } from './ui.jsx';

export default function AvisoActualizacion() {
  const { datos, recargar } = useDatos('/api/actualizacion', { cada: 60_000 });
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState(null);
  if (!datos?.disponible) return null;
  const pedir = async () => {
    if (!window.confirm('Se cerrarán las sesiones de Claude y los chats abiertos y Nullraptor se reiniciará. ¿Actualizar ahora?')) return;
    setPidiendo(true);
    setError(null);
    try { await post('/api/actualizacion/ahora'); await recargar(); } catch (e) { setError(e.message); }
    setPidiendo(false);
  };
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-raptor/25 bg-raptor/10 px-4 py-2 text-[13px] text-texto">
      <Download className="size-4 shrink-0 text-raptor" />
      <p className="min-w-0 flex-1">
        {datos.solicitada
          ? 'Actualización pedida: Nullraptor se reiniciará en unos minutos.'
          : 'Hay una versión nueva de Nullraptor. Se instalará sola cuando no haya sesiones abiertas.'}
        {error && <span className="ml-2 text-fallo">{error}</span>}
      </p>
      {!datos.solicitada && (
        <Boton tam="sm" variante="primario" disabled={pidiendo} onClick={pedir}>
          {pidiendo ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Actualizar ahora
        </Boton>
      )}
    </div>
  );
}
