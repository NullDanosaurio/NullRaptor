// Chat de grupo con Claude y Codex sobre un proyecto (misma lógica que scripts/chat.mjs), y chats guardados.
import { ArrowLeft, ArrowUp, BookCheck, ChevronDown, History, MessagesSquare, Plus, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { enlace, get, haceCuanto, ir, post, useDatos } from '../api.js';
import Markdown from '../componentes/Markdown.jsx';
import { Avatar, Boton, Cargando, cx, Fallo, Insignia, PERSONAS, Punto, Vacio } from '../componentes/ui.jsx';

const DESTINOS = [
  { id: 'ambas', nombre: 'Las dos', ayuda: 'Contestan las dos, alternando quién empieza' },
  { id: 'claude', nombre: 'Claude', ayuda: 'Solo Claude' },
  { id: 'codex', nombre: 'Codex', ayuda: 'Solo Codex' },
];

function Mensaje({ m }) {
  const mio = m.quien === 'dano';
  if (m.quien === 'sistema') {
    return <div className="flex justify-center animate-entrar"><span className="rounded-full border border-fallo/25 bg-fallo/10 px-3 py-1 text-[12px] text-fallo">{m.texto}</span></div>;
  }
  return (
    <div className={cx('flex gap-3 animate-entrar', mio && 'flex-row-reverse')}>
      <Avatar quien={m.quien} className="mt-0.5" />
      <div className={cx('flex min-w-0 max-w-[min(42rem,85%)] flex-col gap-1', mio && 'items-end')}>
        <span className={cx('text-[12px] font-medium', PERSONAS[m.quien]?.texto)}>
          {PERSONAS[m.quien]?.nombre}{m.hora && <span className="ml-2 font-normal text-apagado">{new Date(m.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
        </span>
        <div className={cx('rounded-[18px] px-4 py-2.5 text-[14.5px]', mio ? 'rounded-tr-md bg-elevado text-texto' : 'rounded-tl-md border border-borde bg-panel')}>
          {mio ? <p className="whitespace-pre-wrap leading-relaxed">{m.texto}</p> : <Markdown texto={m.texto} />}
        </div>
      </div>
    </div>
  );
}

function Pensando({ quien }) {
  return (
    <div className="flex gap-3 animate-entrar">
      <Avatar quien={quien} />
      <div className="flex items-center rounded-[18px] rounded-tl-md border border-borde bg-panel px-4 py-2.5">
        <span className="brillo text-[14px]">{PERSONAS[quien].nombre} está pensando…</span>
      </div>
    </div>
  );
}

/** Desplaza al final cuando llega algo nuevo, salvo si Dano ha subido a leer. */
function useAlFinal(dependencia) {
  const ref = useRef(null);
  const [arriba, setArriba] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el && !arriba) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [dependencia, arriba]);
  const alDesplazar = () => {
    const el = ref.current;
    setArriba(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  };
  return { ref, arriba, alDesplazar, bajar: () => setArriba(false) };
}

function ChatAbierto({ id }) {
  const [historial, setHistorial] = useState([]);
  const [escribiendo, setEscribiendo] = useState(null);
  const [proyecto, setProyecto] = useState('');
  const [conectado, setConectado] = useState(true);
  const [cierre, setCierre] = useState(null);
  const [cerrando, setCerrando] = useState(false);
  const [error, setError] = useState(null);
  const [perdido, setPerdido] = useState(false);
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState('ambas');
  const scroll = useAlFinal(`${historial.length}-${escribiendo}`);

  useEffect(() => {
    const fuente = new EventSource(`/api/chats/${id}/eventos`);
    const datos = (e) => JSON.parse(e.data);
    fuente.addEventListener('estado', (e) => { const d = datos(e); setHistorial(d.historial); setEscribiendo(d.escribiendo); setProyecto(d.proyecto); setConectado(true); });
    fuente.addEventListener('mensaje', (e) => setHistorial((h) => [...h, datos(e)]));
    fuente.addEventListener('escribiendo', (e) => setEscribiendo(datos(e)));
    fuente.addEventListener('fallo', (e) => { const d = datos(e); setHistorial((h) => [...h, { quien: 'sistema', texto: `${PERSONAS[d.quien]?.nombre ?? ''}: ${d.texto}` }]); });
    fuente.addEventListener('cerrado', (e) => { setCierre(datos(e)); fuente.close(); });
    fuente.onerror = () => {
      setConectado(false);
      // Si el servidor se reinició, el chat ya no existe: no seguir reintentando.
      get('/api/chats').then((d) => { if (!d.abiertos.some((c) => c.id === id)) { fuente.close(); setPerdido(true); } }).catch(() => {});
    };
    return () => fuente.close();
  }, [id]);

  const ocupado = Boolean(escribiendo);
  const enviar = async (e) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    setError(null);
    try {
      await post(`/api/chats/${id}/mensajes`, { texto: destino === 'ambas' ? limpio : `@${destino} ${limpio}` });
      setTexto('');
    } catch (err) { setError(err); }
  };
  const cerrar = async () => {
    setCerrando(true);
    setError(null);
    try { setCierre(await post(`/api/chats/${id}/cerrar`)); } catch (err) { setError(err); } finally { setCerrando(false); }
  };

  if (perdido) {
    return (
      <Vacio icono={MessagesSquare} titulo="Este chat ya no está abierto" className="h-full">
        El panel se reinició o el chat se cerró. La conversación completa queda en «Guardados en el equipo».
        <div className="mt-4"><Boton variante="primario" onClick={() => ir('chat/nuevo')}><Plus className="size-4" /> Nuevo chat</Boton></div>
      </Vacio>
    );
  }

  if (cierre) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-2xl border border-borde bg-panel p-6 animate-entrar">
          <div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-raptor/10 p-2.5 text-raptor"><BookCheck className="size-5" /></span><div><p className="font-medium text-white">Chat cerrado</p><p className="text-[12px] text-apagado">{proyecto}</p></div></div>
          {cierre.entrada ? (
            <>
              <p className="mb-2 text-[13px] text-tenue">Resumen guardado en <a className="text-raptor" href={enlace('boveda', cierre.nota)}>{cierre.nota}</a>:</p>
              <Markdown texto={cierre.entrada} className="rounded-xl border border-borde bg-elevado/50 p-3.5 text-[13px]" />
            </>
          ) : <p className="text-[13px] text-tenue">No había respuestas que resumir.</p>}
          {cierre.leccion && <p className="mt-3 rounded-xl border border-aviso/25 bg-aviso/10 p-3 text-[13px] text-aviso">Posible lección para Conocimiento/ (no se guarda sola): {cierre.leccion}</p>}
          {cierre.avisos?.map((a) => <p key={a} className="mt-2 text-[12px] text-aviso">{a}</p>)}
          <div className="mt-5 flex gap-2"><Boton variante="primario" onClick={() => ir('chat/nuevo')}><Plus className="size-4" /> Nuevo chat</Boton>{cierre.registro && <Boton onClick={() => ir(`chat/guardado/${cierre.registro}`)}>Ver conversación</Boton>}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-borde px-4 py-3 md:px-6">
        <a href="#/chat" className="text-apagado hover:text-texto md:hidden" aria-label="Volver"><ArrowLeft className="size-5" /></a>
        <div className="flex -space-x-2"><Avatar quien="claude" /><Avatar quien="codex" /></div>
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{proyecto || 'Chat'}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-apagado"><Punto tono={conectado ? 'ok' : 'fallo'} />{conectado ? 'Claude y Codex leen el proyecto (sin modificarlo)' : 'Reconectando…'}</p>
        </div>
        <Boton className="ml-auto" tam="sm" onClick={cerrar} disabled={ocupado || cerrando} title="Cierra el chat y guarda un resumen en el Diario de la bóveda">
          {cerrando ? 'Resumiendo…' : <><Square className="size-3" /> Terminar y resumir</>}
        </Boton>
      </header>

      <div ref={scroll.ref} onScroll={scroll.alDesplazar} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-6">
          {historial.length === 0 && !ocupado && (
            <Vacio icono={MessagesSquare} titulo="Empieza la conversación">Sin destinatario contestan las dos y cada una lee lo que dijo la otra. Elige abajo si quieres hablar solo con una.</Vacio>
          )}
          {historial.map((m, i) => <Mensaje key={`${i}-${m.hora ?? ''}`} m={m} />)}
          {escribiendo && <Pensando quien={escribiendo} />}
        </div>
      </div>
      {scroll.arriba && (
        <div className="relative"><button type="button" onClick={scroll.bajar} className="absolute -top-12 left-1/2 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-borde-fuerte bg-elevado px-3.5 text-[12px] text-tenue shadow-lg hover:text-texto"><ChevronDown className="size-3.5" /> Ir al final</button></div>
      )}

      <form onSubmit={enviar} className="mx-auto w-full max-w-3xl px-4 pt-2 pb-4 md:px-6">
        <Fallo error={error} className="mb-2" />
        <div className="rounded-[22px] border border-borde-fuerte bg-panel shadow-[0_8px_30px_rgb(0_0_0/0.35)] transition-colors focus-within:border-raptor/40">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); } }}
            rows={Math.min(8, Math.max(1, texto.split('\n').length))}
            maxLength={20000}
            placeholder={ocupado ? `Esperando a ${PERSONAS[escribiendo].nombre}…` : 'Escribe a Claude y Codex…'}
            aria-label="Mensaje"
            className="block max-h-56 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14.5px] leading-6 text-texto outline-none placeholder:text-apagado"
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <div role="radiogroup" aria-label="A quién" className="flex gap-1 rounded-full bg-elevado p-0.5">
              {DESTINOS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={destino === d.id}
                  title={d.ayuda}
                  onClick={() => setDestino(d.id)}
                  className={cx('h-7 rounded-full px-3 text-[12px] font-medium transition-colors', destino === d.id ? (d.id === 'claude' ? 'bg-claude/20 text-claude' : d.id === 'codex' ? 'bg-codex/20 text-codex' : 'bg-borde-fuerte text-white') : 'text-apagado hover:text-texto')}
                >
                  {d.nombre}
                </button>
              ))}
            </div>
            <span className="ml-auto hidden text-[11px] text-apagado sm:inline">Intro envía · Mayús+Intro, nueva línea</span>
            <button type="submit" aria-label="Enviar" disabled={!texto.trim() || ocupado} className="ml-2 flex size-8 items-center justify-center rounded-full bg-raptor text-fondo transition-[scale,opacity] duration-150 ease-salida active:scale-[0.92] disabled:opacity-30">
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ChatGuardado({ archivo }) {
  const { datos, error, cargando } = useDatos(`/api/chats/guardado?archivo=${encodeURIComponent(archivo)}`);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-borde px-4 py-3 md:px-6">
        <a href="#/chat" className="text-apagado hover:text-texto md:hidden" aria-label="Volver"><ArrowLeft className="size-5" /></a>
        <History className="size-5 text-apagado" />
        <div className="min-w-0"><p className="truncate font-medium text-white">{archivo.replace(/\.md$/, '')}</p><p className="text-[12px] text-apagado">Guardado solo en este equipo; se borra a los {datos?.dias ?? 30} días</p></div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-6">
          {cargando && <Cargando />}
          <Fallo error={error} />
          {datos?.mensajes.map((m, i) => <Mensaje key={i} m={m} />)}
        </div>
      </div>
    </div>
  );
}

function NuevoChat() {
  const { datos } = useDatos('/api/proyectos');
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(null);
  const locales = (datos ?? []).filter((p) => p.local);
  const crear = async (nombre) => {
    setCreando(nombre);
    setError(null);
    try { const { id } = await post('/api/chats', { proyecto: nombre }); ir(`chat/${id}`); } catch (e) { setError(e); setCreando(null); }
  };
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-4 flex justify-center -space-x-2"><Avatar quien="claude" className="size-10 text-[15px]" /><Avatar quien="dano" className="size-10 text-[15px]" /><Avatar quien="codex" className="size-10 text-[15px]" /></div>
        <h2 className="text-lg font-semibold text-white">Chat con Claude y Codex</h2>
        <p className="mt-1 text-[13px] text-apagado">Elige el proyecto. Las dos lo leen sin modificarlo; al terminar, Claude escribe un resumen en el Diario de la bóveda. Cada mensaje gasta cuota de las dos suscripciones.</p>
        <Fallo error={error} className="mt-4 text-left" />
        <div className="mt-5 grid gap-2">
          {!datos && <Cargando className="justify-center" />}
          {datos && !locales.length && <p className="text-[13px] text-apagado">No hay proyectos descargados en este equipo.</p>}
          {locales.map((p) => (
            <button key={p.nombre} type="button" disabled={Boolean(creando)} onClick={() => crear(p.nombre)} className="flex items-center gap-3 rounded-xl border border-borde bg-panel px-4 py-3 text-left transition-colors hover:border-raptor/40 hover:bg-elevado disabled:opacity-50">
              <span className="flex-1 font-medium text-texto">{p.nombre}</span>
              <span className="text-[12px] text-apagado">{creando === p.nombre ? 'Abriendo…' : 'Abrir chat →'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Chat({ resto }) {
  const { datos } = useDatos('/api/chats', { cada: 5000 });
  const guardado = resto.startsWith('guardado/') ? resto.slice('guardado/'.length) : null;
  const id = !guardado && /^[0-9a-f-]{36}$/.test(resto) ? resto : null;
  const seleccion = guardado ?? id ?? (resto === 'nuevo' ? 'nuevo' : null);

  return (
    <div className="flex h-full">
      <aside className={cx('w-full shrink-0 flex-col border-r border-borde bg-panel/50 md:flex md:w-72', seleccion ? 'hidden' : 'flex')}>
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-[15px] font-semibold text-white">Chats</h1>
          <Boton tam="sm" variante="primario" onClick={() => ir('chat/nuevo')}><Plus className="size-3.5" /> Nuevo</Boton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {datos?.abiertos?.length > 0 && <p className="px-2 pt-2 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">Abiertos</p>}
          {datos?.abiertos?.map((c) => (
            <a key={c.id} href={enlace('chat', c.id)} className={cx('flex items-center gap-2.5 rounded-xl px-3 py-2.5', id === c.id ? 'bg-elevado' : 'hover:bg-elevado/60')}>
              <Punto tono="raptor" vivo={c.ocupado} />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13px] text-texto">{c.proyecto}</span><span className="text-[11px] text-apagado">{c.mensajes} mensajes · {haceCuanto(c.creado)}</span></span>
              {c.ocupado && <Insignia tono="raptor">pensando</Insignia>}
            </a>
          ))}
          <p className="px-2 pt-4 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">Guardados en el equipo</p>
          {datos?.guardados?.length === 0 && <p className="px-3 py-2 text-[12px] text-apagado">Ninguno todavía.</p>}
          {datos?.guardados?.map((g) => (
            <a key={g.archivo} href={enlace('chat', `guardado/${g.archivo}`)} className={cx('block rounded-xl px-3 py-2', guardado === g.archivo ? 'bg-elevado' : 'hover:bg-elevado/60')}>
              <span className="block truncate text-[13px] text-tenue">{g.proyecto}</span>
              <span className="text-[11px] text-apagado">{g.fecha ? new Date(g.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : haceCuanto(g.cambiado)}</span>
            </a>
          ))}
        </div>
      </aside>
      <section className={cx('min-w-0 flex-1', !seleccion && 'hidden md:block')}>
        {id ? <ChatAbierto key={id} id={id} /> : guardado ? <ChatGuardado key={guardado} archivo={guardado} /> : <NuevoChat />}
      </section>
    </div>
  );
}
