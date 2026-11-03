// Jarvis: el modo voz a pantalla completa, pensado para el móvil (botón central de la barra de abajo). Por debajo es un
// chat con Claude sobre un proyecto (como la vista Chat, que lee el proyecto sin modificarlo), con voz: true (persona
// Jarvis) y las respuestas leídas en voz alta. Mantén pulsado el micro, habla y suelta; o escribe con el teclado.
import { AudioLines, Keyboard, Loader2, Mic, Plus, SendHorizontal, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { get, post, useDatos } from '../api.js';
import { Boton, cx, Fallo } from '../componentes/ui.jsx';
import { useVoz } from '../voz.js';

const leer = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** Conversación con Jarvis sobre `proyecto`: reutiliza el chat abierto si sigue vivo; si no, abre uno. Cambiar
 * `reinicio` empieza una conversación nueva. */
function useConversacion(proyecto, alResponder, reinicio) {
  const [id, setId] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const responder = useRef(alResponder);
  responder.current = alResponder;

  useEffect(() => {
    if (!proyecto) return undefined;
    let fuente = null;
    let vivo = true;
    (async () => {
      try {
        const guardado = leer(`jarvis.chat.${proyecto}`);
        const { abiertos } = await get('/api/chats');
        let chat = abiertos.some((c) => c.id === guardado) ? guardado : null;
        if (!chat) {
          chat = (await post('/api/chats', { proyecto, ia: 'claude' })).id;
          guardar(`jarvis.chat.${proyecto}`, chat);
        }
        if (!vivo) return;
        setId(chat);
        fuente = new EventSource(`/api/chats/${chat}/eventos`);
        const datos = (e) => JSON.parse(e.data);
        fuente.addEventListener('estado', (e) => { const d = datos(e); setHistorial(d.historial); setPensando(Boolean(d.escribiendo)); });
        fuente.addEventListener('mensaje', (e) => { const m = datos(e); setHistorial((h) => [...h, m]); if (m.quien !== 'dano') responder.current(m.texto); });
        fuente.addEventListener('escribiendo', (e) => setPensando(Boolean(datos(e))));
        fuente.addEventListener('fallo', (e) => setError(new Error(datos(e).texto)));
      } catch (e) { if (vivo) setError(e); }
    })();
    return () => { vivo = false; fuente?.close(); };
  }, [proyecto, reinicio]);

  const enviar = async (texto) => {
    if (!id || !texto.trim()) return;
    setError(null);
    try { await post(`/api/chats/${id}/mensajes`, { texto: texto.trim(), voz: true }); } catch (e) { setError(e); }
  };
  const nueva = () => { guardar(`jarvis.chat.${proyecto}`, null); setHistorial([]); setId(null); };
  return { id, historial, pensando, error, enviar, nueva };
}

export default function Jarvis() {
  const { datos: proyectos } = useDatos('/api/proyectos');
  const locales = (proyectos ?? []).filter((p) => p.local).map((p) => p.nombre);
  const [proyecto, setProyecto] = useState(() => leer('jarvis.proyecto'));
  const [reinicio, setReinicio] = useState(0);
  const [teclado, setTeclado] = useState(false);
  const [texto, setTexto] = useState('');
  const voz = useVoz();
  // Por defecto, Nullraptor; si no, el primer proyecto (la bóveda, al final: también se puede hablar de ella).
  const porDefecto = ['Nullraptor', ...locales.filter((p) => p !== 'Bóveda'), 'Bóveda'].find((p) => locales.includes(p)) ?? null;
  const elegido = proyecto && locales.includes(proyecto) ? proyecto : porDefecto;
  const conv = useConversacion(elegido, voz.decir, reinicio);
  const fin = useRef(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conv.historial.length, conv.pensando]);

  const cambiar = (p) => { setProyecto(p); guardar('jarvis.proyecto', p); };
  const soltar = async () => {
    const dicho = (await voz.terminar()).trim();
    if (dicho && !conv.pensando) conv.enviar(dicho);
  };
  const escribir = (e) => { e.preventDefault(); if (texto.trim() && !conv.pensando) { conv.enviar(texto); setTexto(''); } };

  const instalada = voz.estado?.instalada !== false;
  const estado = !instalada ? 'La voz no está instalada en el equipo (sh /nullraptor/scripts/voz-instalar.sh).'
    : !voz.micPosible ? 'El micrófono necesita la app, este equipo o Tailscale (https).'
      : voz.fase === 'escuchando' ? 'Escuchando… suelta para enviar'
        : voz.fase === 'transcribiendo' ? 'Transcribiendo…'
          : conv.pensando ? 'Pensando…'
            : voz.hablando ? 'Hablando' : 'Mantén pulsado para hablar';

  return (
    <div className="flex h-full flex-col bg-fondo">
      <header className="flex items-center gap-2 border-b border-borde px-4 py-3">
        <AudioLines className="size-5 shrink-0 text-raptor" />
        <h1 className="text-[17px] font-semibold text-white">Jarvis</h1>
        <label className="ml-auto flex min-w-0 items-center gap-2 text-[13px] text-apagado">
          <span className="hidden sm:inline">Proyecto</span>
          <select value={elegido ?? ''} onChange={(e) => cambiar(e.target.value)} aria-label="Proyecto sobre el que habla Jarvis"
            className="h-11 min-w-0 max-w-[45vw] rounded-xl border border-borde-fuerte bg-elevado px-3 text-[15px] text-texto">
            {locales.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Boton tam="icono" onClick={() => { conv.nueva(); setReinicio((n) => n + 1); }} aria-label="Conversación nueva" title="Conversación nueva" className="size-11"><Plus className="size-5" /></Boton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-5">
          {!conv.historial.length && !conv.pensando && (
            <p className="mt-10 text-center text-[17px] leading-relaxed text-tenue">A su servicio, señor.<br /><span className="text-[14px] text-apagado">Pregúnteme por {elegido ?? 'un proyecto'}: lo leo para contestarle, sin tocar nada.</span></p>
          )}
          {conv.historial.map((m, i) => (m.quien === 'dano'
            ? <p key={i} className="self-end rounded-2xl rounded-br-md bg-elevado px-4 py-2.5 text-[15px] text-tenue">{m.texto}</p>
            : <p key={i} className="whitespace-pre-wrap text-[19px] leading-relaxed text-white">{m.texto}</p>))}
          {conv.pensando && <p className="brillo text-[17px]">Jarvis está pensando…</p>}
          <div ref={fin} />
        </div>
      </div>

      <div className="border-t border-borde px-4 pt-4 pb-5">
        <Fallo error={conv.error} className="mb-3" />
        {voz.aviso && <p className="mb-2 text-center text-[13px] text-aviso">{voz.aviso}</p>}
        {teclado ? (
          <form onSubmit={escribir} className="mx-auto flex max-w-2xl items-center gap-2">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus placeholder="Escriba a Jarvis…" aria-label="Mensaje para Jarvis"
              className="h-12 min-w-0 flex-1 rounded-2xl border border-borde-fuerte bg-panel px-4 text-[16px] text-texto outline-none focus:border-raptor/50" />
            <button type="submit" aria-label="Enviar" disabled={!texto.trim() || conv.pensando} className="flex size-12 items-center justify-center rounded-full bg-raptor text-fondo disabled:opacity-30"><SendHorizontal className="size-5" /></button>
            <button type="button" aria-label="Hablar" onClick={() => setTeclado(false)} className="flex size-12 items-center justify-center rounded-full border border-borde-fuerte text-tenue"><Mic className="size-5" /></button>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex w-full max-w-sm items-center justify-between">
              <button type="button" onClick={() => setTeclado(true)} aria-label="Escribir en vez de hablar" className="flex size-12 items-center justify-center rounded-full border border-borde-fuerte text-tenue active:bg-elevado"><Keyboard className="size-5" /></button>
              <button type="button" aria-label="Mantén pulsado para hablar" disabled={!instalada || !voz.micPosible || !conv.id || conv.pensando || voz.fase === 'transcribiendo'}
                onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); voz.callar(); voz.empezar(); }}
                onPointerUp={soltar} onPointerCancel={soltar} onContextMenu={(e) => e.preventDefault()}
                className={cx('flex size-24 touch-none select-none items-center justify-center rounded-full border-4 transition-[scale,background-color,box-shadow] duration-150 disabled:opacity-30',
                  voz.fase === 'escuchando' ? 'scale-110 border-raptor bg-raptor text-fondo shadow-[0_0_40px_rgb(181_242_61/0.5)]' : 'border-raptor/60 bg-raptor/10 text-raptor active:scale-95')}>
                {voz.fase === 'transcribiendo' || (!conv.id && instalada) ? <Loader2 className="size-9 animate-spin" /> : <Mic className="size-9" />}
              </button>
              <button type="button" onClick={voz.callar} disabled={!voz.hablando} aria-label="Callar" className="flex size-12 items-center justify-center rounded-full border border-borde-fuerte text-tenue active:bg-elevado disabled:opacity-30"><VolumeX className="size-5" /></button>
            </div>
            <p className="text-center text-[13px] text-apagado" aria-live="polite">{estado}</p>
          </div>
        )}
      </div>
    </div>
  );
}
