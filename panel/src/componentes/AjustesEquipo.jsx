// Acceso (red de casa, Tailscale) y carpetas de Windows para la IA, editables desde Ajustes. El contenedor no toca
// Windows: se guarda un pedido y el lanzador lo aplica (al abrirlo o en su tarea de cada 5 minutos, cuando no hay
// sesiones abiertas, o en seguida con «Aplicar ahora»). Por Tailscale pide la passkey; con solo el código, no se cambia.
import { FolderPlus, HardDrive, Loader2, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haceCuanto, post, useDatos } from '../api.js';
import { usePasskey } from './Passkey.jsx';
import { Boton, Cargando, cx, Fallo, Insignia, Tarjeta } from './ui.jsx';

const mismas = (a, b) => a.length === b.length && a.every((c, i) => c.toLowerCase() === b[i].toLowerCase());

function Interruptor({ activo, alCambiar, titulo, ayuda, deshabilitado }) {
  return (
    <label className={cx('flex items-start gap-3 py-2.5', deshabilitado ? 'opacity-50' : 'cursor-pointer')}>
      <button type="button" role="switch" aria-checked={activo} disabled={deshabilitado} onClick={() => alCambiar(!activo)}
        className={cx('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors', activo ? 'bg-raptor' : 'bg-borde-fuerte')}>
        <span className={cx('absolute top-0.5 size-4 rounded-full bg-white transition-[left]', activo ? 'left-[18px]' : 'left-0.5')} />
      </button>
      <span className="min-w-0">
        <span className="block text-[13px] text-texto">{titulo}</span>
        <span className="block text-[12px] text-apagado">{ayuda}</span>
      </span>
    </label>
  );
}

export default function AjustesEquipo() {
  const { datos, error, recargar } = useDatos('/api/equipo', { cada: 10_000 });
  const [form, setForm] = useState(null);
  const [nueva, setNueva] = useState('');
  const [fallo, setFallo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const { intentar, aviso } = usePasskey(setFallo);
  const base = datos ? (datos.pedido ?? datos.actual) : null;
  // El formulario parte de lo pedido (si hay) o de lo que hay; se rehace cuando cambia eso.
  const clave = base ? JSON.stringify([base.red, base.tailscale, base.carpetas, datos.pedido?.id]) : '';
  useEffect(() => { if (base) setForm({ red: base.red, tailscale: base.tailscale, carpetas: [...base.carpetas] }); }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!datos || !form) return <Tarjeta titulo="Acceso y carpetas de Windows" icono={ShieldCheck}>{error ? <Fallo error={error} /> : <Cargando />}</Tarjeta>;
  const { actual, pedido, resultado } = datos;
  const editable = actual.lanzador && datos.cambiar;
  const cambiado = form.red !== base.red || form.tailscale !== base.tailscale || !mismas(form.carpetas, base.carpetas);

  const enviar = (ahora) => intentar(async () => {
    setGuardando(true);
    try { await post('/api/equipo', { ...form, ahora }); await recargar(); } finally { setGuardando(false); }
  });
  const retirar = () => intentar(async () => { await post('/api/equipo/cancelar'); await recargar(); });
  const anadir = (e) => {
    e.preventDefault();
    const c = nueva.trim();
    if (!c) return;
    if (!form.carpetas.some((x) => x.toLowerCase() === c.toLowerCase())) setForm({ ...form, carpetas: [...form.carpetas, c] });
    setNueva('');
  };

  return (
    <Tarjeta titulo="Acceso y carpetas de Windows" icono={ShieldCheck}>
      {aviso}
      {!actual.lanzador && (
        <p className="mb-3 rounded-xl border border-borde px-3 py-2 text-[12px] text-apagado">Este Nullraptor no lo arrancó el lanzador de Windows: aquí solo se ve cómo está.</p>
      )}
      {actual.lanzador && !datos.cambiar && (
        <p className="mb-3 rounded-xl border border-borde px-3 py-2 text-[12px] text-apagado">Desde la red de casa con solo el código no se cambia: hazlo desde el PC o por Tailscale con passkey.</p>
      )}

      <div className="divide-y divide-borde">
        <Interruptor activo={form.red} deshabilitado={!editable} alCambiar={(red) => setForm({ ...form, red })} titulo="Red de casa"
          ayuda="Otros navegadores de tu casa entran con un código. Sin HTTPS: solo en tu red de confianza. La primera vez, el lanzador pide administrador para el firewall." />
        <Interruptor activo={form.tailscale} deshabilitado={!editable} alCambiar={(tailscale) => setForm({ ...form, tailscale })} titulo="Desde cualquier parte (Tailscale)"
          ayuda={actual.dominio ? `Ahora en https://${actual.dominio}, solo tus dispositivos y con passkey.` : 'Solo tus dispositivos, con passkey. Antes: Tailscale instalado y conectado en el PC, con MagicDNS y HTTPS activados.'} />
      </div>

      <p className="mt-4 mb-1.5 flex items-center gap-1.5 text-[12px] text-apagado"><HardDrive className="size-3.5" /> Carpetas de Windows que ve la IA (en <span className="font-mono">/pc/&lt;nombre&gt;</span>, con lectura y escritura)</p>
      <ul className="space-y-1">
        {form.carpetas.map((c) => (
          <li key={c} className="flex items-center gap-2 rounded-xl bg-elevado/40 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-texto">{c}</span>
            {editable && <Boton tam="icono" variante="fantasma" aria-label={`Quitar ${c}`} onClick={() => setForm({ ...form, carpetas: form.carpetas.filter((x) => x !== c) })}><Trash2 className="size-3.5" /></Boton>}
          </li>
        ))}
        {!form.carpetas.length && <li className="px-3 py-1.5 text-[12px] text-apagado">Ninguna.</li>}
      </ul>
      {editable && (
        <form onSubmit={anadir} className="mt-2 flex gap-2">
          <input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="C:\Users\tu\Documentos\Impresión 3D" aria-label="Carpeta de Windows"
            className="h-9 min-w-0 flex-1 rounded-xl border border-borde bg-elevado/60 px-3 font-mono text-[12px] outline-none placeholder:text-apagado focus:border-raptor/40" />
          <Boton type="submit" tam="md" disabled={!nueva.trim()}><FolderPlus className="size-4" /> Añadir</Boton>
        </form>
      )}

      <Fallo error={fallo} className="mt-3" />
      {pedido && (
        <div className="mt-4 rounded-xl border border-aviso/25 bg-aviso/10 p-3 text-[13px] text-aviso">
          <p>Pendiente de aplicar (pedido {haceCuanto(pedido.fecha)}{pedido.ahora ? ', ahora' : ''}): se aplica al abrir el lanzador o, en la tarea de cada 5 minutos, cuando no haya sesiones abiertas.</p>
          {editable && (
            <div className="mt-2 flex flex-wrap gap-2">
              {!pedido.ahora && <Boton tam="sm" variante="primario" disabled={guardando} onClick={() => enviar(true)}><Zap className="size-3.5" /> Aplicar ahora (cierra las sesiones)</Boton>}
              <Boton tam="sm" variante="fantasma" onClick={retirar}>Retirar</Boton>
            </div>
          )}
        </div>
      )}
      {resultado && !pedido && (
        <div className={cx('mt-4 rounded-xl border p-3 text-[13px]', resultado.estado === 'error' ? 'border-fallo/25 bg-fallo/10 text-fallo' : 'border-borde text-tenue')}>
          <p className="flex flex-wrap items-center gap-2"><Insignia tono={resultado.estado === 'error' ? 'fallo' : 'ok'}>{resultado.estado === 'error' ? 'no aplicado' : 'aplicado'}</Insignia> {haceCuanto(resultado.fecha)} · {resultado.mensaje}</p>
          {resultado.avisos?.map((a) => <p key={a} className="mt-1 text-aviso">{a}</p>)}
        </div>
      )}
      {editable && cambiado && (
        <div className="mt-4 flex justify-end">
          <Boton variante="primario" disabled={guardando} onClick={() => enviar(false)}>{guardando ? <Loader2 className="size-4 animate-spin" /> : null} Guardar</Boton>
        </div>
      )}
    </Tarjeta>
  );
}
