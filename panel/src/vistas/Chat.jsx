// Chat sobre un proyecto con la IA que elijas, Claude o Codex (misma lógica que scripts/chat.mjs), y chats guardados.
// Rutas: #/chat · #/chat/nuevo[/<proyecto>] · #/chat/<id> · #/chat/guardado/<archivo>.
// Modo voz (botón «Voz»): se habla manteniendo pulsado el micro (Whisper) y las respuestas se leen en voz alta
// (Kokoro), con la personalidad de Jarvis (scripts/chat.mjs, PERSONA_JARVIS).
import { ArrowLeft, ArrowUp, AudioLines, BookCheck, ChevronDown, History, Loader2, MessagesSquare, Mic, Plus, Square, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { enlace, get, haceCuanto, ir, post, useDatos } from '../api.js';
import Copiar from '../componentes/Copiar.jsx';
import Markdown from '../componentes/Markdown.jsx';
import { guardarPerfil, perfilGuardado, SelectorPerfil } from '../componentes/Perfil.jsx';
import { Avatar, Boton, Cargando, cx, Fallo, Insignia, PERSONAS, Punto, Vacio } from '../componentes/ui.jsx';
import { useVoz } from '../voz.js';

const IAS = [
  { id: 'claude', ayuda: 'Claude Code, con tu suscripción de Claude.' },
  { id: 'codex', ayuda: 'Codex, con tu suscripción de ChatGPT.' },
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
        <span className={cx('flex items-center text-[12px] font-medium', PERSONAS[m.quien]?.texto)}>
          {PERSONAS[m.quien]?.nombre}{m.hora && <span className="ml-2 font-normal text-apagado">{new Date(m.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>}
          {/* En las respuestas de la IA: copia el mensaje tal cual (con su Markdown). */}
          {!mio && <Copiar texto={m.texto} className="ml-1 font-normal" titulo="Copiar el mensaje" />}
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
  const [ia, setIa] = useState(null);
  const scroll = useAlFinal(`${historial.length}-${escribiendo}`);
  const voz = useVoz();
  const [modoVoz, setModoVoz] = useState(() => { try { return localStorage.getItem('chat.voz') === '1'; } catch { return false; } });
  const enVoz = useRef(modoVoz); // para el oyente de SSE, que no se vuelve a crear
  enVoz.current = modoVoz;
  const alternarVoz = () => {
    const v = !modoVoz;
    setModoVoz(v);
    if (!v) voz.callar();
    try { localStorage.setItem('chat.voz', v ? '1' : '0'); } catch { /* sin almacenamiento */ }
  };

  useEffect(() => {
    const fuente = new EventSource(`/api/chats/${id}/eventos`);
    const datos = (e) => JSON.parse(e.data);
    fuente.addEventListener('estado', (e) => { const d = datos(e); setHistorial(d.historial); setEscribiendo(d.escribiendo); setProyecto(d.proyecto); setIa(d.ia); setConectado(true); });
    fuente.addEventListener('mensaje', (e) => {
      const m = datos(e);
      setHistorial((h) => [...h, m]);
      if (enVoz.current && m.quien !== 'dano') voz.decir(m.texto); // Jarvis lo dice en voz alta
    });
    fuente.addEventListener('escribiendo', (e) => setEscribiendo(datos(e)));
    fuente.addEventListener('fallo', (e) => { const d = datos(e); setHistorial((h) => [...h, { quien: 'sistema', texto: `${PERSONAS[d.quien]?.nombre ?? ''}: ${d.texto}` }]); });
    fuente.addEventListener('cerrado', (e) => { setCierre(datos(e)); fuente.close(); });
    fuente.onerror = () => {
      setConectado(false);
      // Si el servidor se reinició, el chat ya no existe: no seguir reintentando.
      get('/api/chats').then((d) => { if (!d.abiertos.some((c) => c.id === id)) { fuente.close(); setPerdido(true); } }).catch(() => {});
    };
    return () => fuente.close();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ocupado = Boolean(escribiendo);
  const mandar = async (limpio) => {
    setError(null);
    await post(`/api/chats/${id}/mensajes`, { texto: limpio, voz: modoVoz });
  };
  const enviar = async (e) => {
    e?.preventDefault();
    const limpio = texto.trim();
    if (!limpio || ocupado) return;
    try { await mandar(limpio); setTexto(''); } catch (err) { setError(err); }
  };
  // Pulsar y hablar: al soltar, lo transcrito se envía solo.
  const soltar = async () => {
    const dicho = (await voz.terminar()).trim();
    if (dicho && !ocupado) { try { await mandar(dicho); } catch (err) { setError(err); } }
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
        {ia && <Avatar quien={ia} />}
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{proyecto || 'Chat'}</p>
          <p className="flex items-center gap-1.5 text-[12px] text-apagado"><Punto tono={conectado ? 'ok' : 'fallo'} />{conectado ? `${PERSONAS[ia]?.nombre ?? 'La IA'} lee el proyecto (sin modificarlo)` : 'Reconectando…'}</p>
        </div>
        <Boton className="ml-auto" tam="sm" variante={modoVoz ? 'primario' : 'suave'} onClick={alternarVoz} aria-pressed={modoVoz}
          disabled={!voz.estado?.instalada} title={voz.estado?.instalada ? 'Hablar con Jarvis: pulsa y habla, y te contesta en voz alta' : 'La voz no está instalada: sh /nullraptor/scripts/voz-instalar.sh'}>
          <AudioLines className="size-3.5" /> Voz
        </Boton>
        <Boton tam="sm" onClick={cerrar} disabled={ocupado || cerrando} title="Cierra el chat y guarda un resumen en el Diario de la bóveda">
          {cerrando ? 'Resumiendo…' : <><Square className="size-3" /> Terminar y resumir</>}
        </Boton>
      </header>

      <div ref={scroll.ref} onScroll={scroll.alDesplazar} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 md:px-6">
          {historial.length === 0 && !ocupado && (
            <Vacio icono={MessagesSquare} titulo="Empieza la conversación">{PERSONAS[ia]?.nombre ?? 'La IA'} lee el proyecto para contestarte, sin modificarlo. Para que cambie cosas, abre una sesión desde Proyectos.</Vacio>
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
        {modoVoz && (
          <div className="mb-3 flex flex-col items-center gap-2">
            <button type="button" aria-label="Mantén pulsado para hablar" disabled={!voz.micPosible || ocupado || voz.fase === 'transcribiendo'}
              onPointerDown={(e) => { e.preventDefault(); voz.callar(); voz.empezar(); }} onPointerUp={soltar} onPointerLeave={() => { if (voz.fase === 'escuchando') soltar(); }} onPointerCancel={soltar}
              onContextMenu={(e) => e.preventDefault()}
              className={cx('flex size-16 touch-none select-none items-center justify-center rounded-full border-2 transition-[scale,background-color] duration-150 disabled:opacity-30',
                voz.fase === 'escuchando' ? 'scale-110 border-raptor bg-raptor text-fondo shadow-[0_0_30px_rgb(181_242_61/0.45)]' : 'border-raptor/50 bg-raptor/10 text-raptor active:scale-95')}>
              {voz.fase === 'transcribiendo' ? <Loader2 className="size-6 animate-spin" /> : <Mic className="size-6" />}
            </button>
            <p className="flex items-center gap-2 text-[12px] text-apagado">
              {!voz.micPosible ? 'El micrófono necesita este equipo o Tailscale (https); por la red de casa no se puede.'
                : voz.fase === 'escuchando' ? 'Escuchando… suelta para enviar'
                  : voz.fase === 'transcribiendo' ? 'Transcribiendo…'
                    : voz.hablando ? 'Jarvis está hablando'
                      : ocupado ? 'Jarvis está pensando…' : 'Mantén pulsado para hablar'}
              {voz.hablando && <button type="button" onClick={voz.callar} className="flex items-center gap-1 rounded-md border border-borde px-2 py-0.5 text-tenue hover:text-texto"><VolumeX className="size-3" /> Callar</button>}
            </p>
            {voz.aviso && <p className="text-[12px] text-aviso">{voz.aviso}</p>}
          </div>
        )}
        <div className="rounded-[22px] border border-borde-fuerte bg-panel shadow-[0_8px_30px_rgb(0_0_0/0.35)] transition-colors focus-within:border-raptor/40">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); enviar(); } }}
            rows={Math.min(8, Math.max(1, texto.split('\n').length))}
            maxLength={20000}
            placeholder={ocupado ? `Esperando a ${PERSONAS[escribiendo].nombre}…` : `Escribe a ${PERSONAS[ia]?.nombre ?? 'la IA'}…`}
            aria-label="Mensaje"
            className="block max-h-56 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-[14.5px] leading-6 text-texto outline-none placeholder:text-apagado"
          />
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
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

function NuevoChat({ proyectoInicial }) {
  const { datos } = useDatos('/api/proyectos');
  const [ia, setIa] = useState('claude');
  const [perfil, setPerfil] = useState(() => (proyectoInicial ? perfilGuardado(proyectoInicial) : null));
  const [error, setError] = useState(null);
  const [creando, setCreando] = useState(null);
  const locales = (datos ?? []).filter((p) => p.local);
  const crear = async (nombre) => {
    setCreando(nombre);
    setError(null);
    const conPerfil = ia === 'claude' ? perfil : null; // Codex no tiene subagentes: sin perfil
    try {
      const { id } = await post('/api/chats', { proyecto: nombre, ia, perfil: conPerfil });
      if (ia === 'claude') guardarPerfil(nombre, perfil);
      ir(`chat/${id}`);
    } catch (e) { setError(e); setCreando(null); }
  };
  return (
    <div className="flex h-full items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md">
        <h2 className="text-center text-lg font-semibold text-white">Nuevo chat</h2>
        <p className="mt-1 text-center text-[13px] text-apagado">Lee el proyecto sin modificarlo; al terminar, escribe un resumen en el Diario de la bóveda.</p>
        <div role="radiogroup" aria-label="Con quién" className="mt-5 grid grid-cols-2 gap-2">
          {IAS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={ia === x.id} onClick={() => setIa(x.id)}
              className={cx('flex flex-col items-center gap-2 rounded-2xl border p-4 text-center transition-colors', ia === x.id ? (x.id === 'claude' ? 'border-claude/50 bg-claude/10' : 'border-codex/50 bg-codex/10') : 'border-borde bg-panel hover:bg-elevado')}>
              <Avatar quien={x.id} className="size-10 text-[15px]" />
              <span className={cx('font-medium', PERSONAS[x.id].texto)}>{PERSONAS[x.id].nombre}</span>
              <span className="text-[11px] text-apagado">{x.ayuda}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 mb-2 text-[12px] text-apagado">Perfil</p>
        <SelectorPerfil valor={perfil} alCambiar={setPerfil} deshabilitado={ia !== 'claude'}
          nota={ia !== 'claude' ? 'Codex no tiene subagentes: responde sin perfil.' : perfil === 'director' ? 'Modo consultor: analiza y opina; el equipo trabaja en las sesiones.' : null} />
        <Fallo error={error} className="mt-4" />
        <p className="mt-5 mb-2 text-[12px] text-apagado">Proyecto</p>
        <div className="grid gap-2">
          {!datos && <Cargando className="justify-center" />}
          {datos && !locales.length && <p className="text-[13px] text-apagado">No hay proyectos descargados en este equipo.</p>}
          {locales.map((p) => (
            <button key={p.nombre} type="button" disabled={Boolean(creando)} onClick={() => crear(p.nombre)}
              className={cx('flex items-center gap-3 rounded-xl border bg-panel px-4 py-3 text-left transition-colors hover:border-raptor/40 hover:bg-elevado disabled:opacity-50', p.nombre === proyectoInicial ? 'border-raptor/40' : 'border-borde')}>
              <span className="flex-1 font-medium text-texto">{p.nombre}</span>
              <span className="text-[12px] text-apagado">{creando === p.nombre ? 'Abriendo…' : `Hablar con ${PERSONAS[ia].nombre} →`}</span>
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
  const nuevo = resto === 'nuevo' || resto.startsWith('nuevo/');
  const seleccion = guardado ?? id ?? (nuevo ? 'nuevo' : null);

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
              <Avatar quien={c.ia} className="size-6 text-[11px]" />
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
        {id ? <ChatAbierto key={id} id={id} /> : guardado ? <ChatGuardado key={guardado} archivo={guardado} /> : <NuevoChat key={resto} proyectoInicial={nuevo ? resto.slice('nuevo/'.length) : null} />}
      </section>
    </div>
  );
}
