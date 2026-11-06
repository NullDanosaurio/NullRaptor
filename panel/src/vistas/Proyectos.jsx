// Proyectos: los del equipo y los que conoce la bóveda. En cada uno: abrir una sesión de Claude Code (terminal del
// panel y claude.ai o el móvil), chat, su nota de la bóveda, el flujo automático en vivo y sus últimos commits.
// Rutas: #/proyectos · #/proyectos/<P> · #/proyectos/<P>/terminal/<id>. Arriba, «Traer» crea o clona uno.
import { ArrowLeft, BookOpen, CircleDashed, CloudDownload, FolderGit2, GitBranch, GitCommitHorizontal, ListChecks, Loader2, MessagesSquare, Plus, SquareTerminal, Terminal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { duracion, enlace, haceCuanto, ir, post, useDatos } from '../api.js';
import { BarraFases, LineaFases, NOMBRE_FASE } from '../componentes/Fases.jsx';
import Markdown, { indiceNotas } from '../componentes/Markdown.jsx';
import { usePasskey } from '../componentes/Passkey.jsx';
import { SelectorPerfil, usePerfil } from '../componentes/Perfil.jsx';
import { enlaceTerminal, TarjetaSesion, VistaTerminal } from '../componentes/Sesiones.jsx';
import TraerProyecto from '../componentes/TraerProyecto.jsx';
import { Boton, Cargando, cx, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';

const BOVEDA = 'Bóveda';

const ESTADOS = {
  integrado: { tono: 'ok', texto: 'integrada' },
  'en curso': { tono: 'raptor', texto: 'en curso' },
  'listo para revisar': { tono: 'codex', texto: 'lista para revisar' },
  rechazado: { tono: 'fallo', texto: 'rechazada' },
  'no integrado': { tono: 'aviso', texto: 'no integrada' },
  error: { tono: 'fallo', texto: 'error' },
  cancelado: { tono: 'aviso', texto: 'cancelada' },
  interrumpido: { tono: 'aviso', texto: 'interrumpida' },
  pendiente: { tono: 'neutro', texto: 'pendiente' },
};

function Tarea({ t, vivo }) {
  const e = ESTADOS[t.estado] ?? { tono: 'neutro', texto: t.estado };
  const ej = t.ejecucion;
  const activa = t.estado === 'en curso' && ej;
  return (
    <li className={cx('rounded-xl border p-3.5 transition-colors', activa ? 'border-raptor/30 bg-raptor/[0.04]' : 'border-borde bg-elevado/30')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] text-apagado">{t.id}</span>
        <span className="line-clamp-2 min-w-0 flex-1 font-medium text-texto [overflow-wrap:anywhere]" title={t.titulo}>{t.titulo}</span>
        <Insignia tono={e.tono}>{e.texto}</Insignia>
      </div>
      {t.dependencias.length > 0 && t.estado === 'pendiente' && <p className="mt-1.5 text-[12px] text-apagado">Depende de {t.dependencias.join(', ')}</p>}
      {ej && !activa && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1"><BarraFases fases={ej.fases} actual={ej.actual} enCurso={false} /></div>
          <span className="shrink-0 text-[11px] tabular-nums text-apagado">
            {ej.intentos} intento{ej.intentos === 1 ? '' : 's'}{ej.fin && ej.inicio ? ` · ${duracion(Date.parse(ej.fin) - Date.parse(ej.inicio))}` : ''}
          </span>
        </div>
      )}
      {activa && (
        <div className="mt-3 grid gap-4 sm:grid-cols-[220px_1fr]">
          <div>
            <p className="mb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">Intento {ej.intento} de {ej.maxIntentos}</p>
            <LineaFases fases={ej.fases} actual={ej.actual} enCurso={vivo} />
          </div>
          <div className="min-w-0 rounded-xl border border-borde bg-[#0c0f0d] p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-apagado"><Terminal className="size-3.5" /> {ej.enVivo ? 'En vivo' : 'Último registro'} · {ej.actual ? NOMBRE_FASE[ej.actual] : '—'} · {duracion(Date.now() - ej.desde)} en esta fase</p>
            <p className="font-mono text-[12px] leading-relaxed break-all text-tenue">{ej.ultimo || 'Sin salida todavía…'}</p>
          </div>
        </div>
      )}
    </li>
  );
}

/** La nota del proyecto en la bóveda (Proyectos/<P>.md), con sus [[enlaces]]. */
function NotaProyecto({ ruta }) {
  const { datos, error } = useDatos(`/api/boveda/nota?ruta=${encodeURIComponent(ruta)}`);
  const notas = useDatos('/api/boveda/notas');
  const indice = useMemo(() => indiceNotas(notas.datos ?? []), [notas.datos]);
  return (
    <Tarjeta titulo="Nota en la bóveda" icono={BookOpen} accion={<a href={enlace('boveda', ruta)} className="text-[12px] text-apagado hover:text-raptor">Abrir →</a>}>
      {error ? <p className="text-[13px] text-apagado">{error.estado === 404 ? 'Aún no tiene nota.' : error.message}</p> : !datos ? <Cargando /> : (
        <div className="max-h-96 overflow-y-auto pr-1"><Markdown texto={datos.cuerpo} indice={indice} className="text-[14px]" /></div>
      )}
    </Tarjeta>
  );
}

function Flujo({ flujo, nombre }) {
  const vivo = Boolean(flujo.bloqueo?.vivo);
  const integradas = flujo.tareas.filter((t) => t.estado === 'integrado').length;
  return (
    <Tarjeta titulo={`Flujo automático · ${integradas}/${flujo.tareas.length} integradas`} icono={ListChecks}>
      {flujo.tareas.length ? (
        <ul className="space-y-2.5">{flujo.tareas.map((t) => <Tarea key={t.id} t={t} vivo={vivo} />)}</ul>
      ) : (
        <Vacio icono={CircleDashed} titulo="Sin tareas en la bóveda">
          Crea tareas en <code className="font-mono">Proyectos/{nombre}/Tareas/*.md</code> de la bóveda y lánzalas con <code className="font-mono">npm run flujo -- plan</code>.
        </Vacio>
      )}
      {flujo.ramasPendientes > 0 && <p className="mt-3 text-[12px] text-aviso">{flujo.ramasPendientes} rama{flujo.ramasPendientes === 1 ? '' : 's'} flujo/… sin integrar (intentos rechazados conservados).</p>}
    </Tarjeta>
  );
}

function Commits({ commits }) {
  return (
    <Tarjeta titulo="Últimos commits" icono={GitCommitHorizontal} cuerpo="px-4 py-2">
      {commits?.length ? (
        <ol className="relative">
          {commits.map((c, i) => (
            <li key={c.hash} className="relative flex gap-3 py-2.5">
              {i < commits.length - 1 && <span aria-hidden="true" className="absolute top-6 left-[4.5px] h-full w-px bg-borde" />}
              <span className={cx('mt-1.5 size-2.5 shrink-0 rounded-full ring-2 ring-panel', i === 0 ? 'bg-raptor' : 'bg-borde-fuerte')} />
              <div className="min-w-0">
                <p className="text-[13px] leading-snug text-texto">{c.asunto}</p>
                <p className="mt-0.5 text-[11px] text-apagado"><span className="font-mono">{c.hash}</span> · {c.autor} · {haceCuanto(c.fecha)}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : <Vacio titulo="Sin commits" />}
    </Tarjeta>
  );
}

/** Un proyecto que solo está en la bóveda: se puede descargar al equipo. */
function SoloEnBoveda({ p, recargar }) {
  const [fallo, setFallo] = useState(null);
  const [bajando, setBajando] = useState(false);
  const { intentar, aviso } = usePasskey(setFallo);
  const descargar = () => intentar(async () => {
    setBajando(true);
    try { await post('/api/proyectos/descargar', { nombre: p.nombre }); recargar(); } finally { setBajando(false); }
  });
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-borde bg-panel/80 p-4">
        {aviso}
        <p className="text-[14px] text-texto">Este proyecto está en la bóveda pero no en este equipo.</p>
        {p.repo && <p className="mt-1 font-mono text-[12px] break-all text-apagado">{p.repo}</p>}
        <Fallo error={fallo} className="mt-3" />
        {p.repo && (
          <Boton variante="primario" className="mt-3" disabled={bajando} onClick={descargar}>
            {bajando ? <><Loader2 className="size-4 animate-spin" /> Descargando…</> : <><CloudDownload className="size-4" /> Descargar al equipo</>}
          </Boton>
        )}
      </div>
      {p.nota && <NotaProyecto ruta={p.nota} />}
    </div>
  );
}

/** Sesión de Claude Code del proyecto: abrirla, verla o cerrarla. */
function SesionProyecto({ nombre }) {
  const { datos, recargar } = useDatos('/api/remoto', { cada: 2000 });
  const [fallo, setFallo] = useState(null);
  const [abriendo, setAbriendo] = useState(false);
  const [ia, setIa] = useState('claude');
  const [perfil, setPerfil] = usePerfil(nombre);
  const { intentar, aviso } = usePasskey(setFallo);
  const sesiones = (datos?.sesiones ?? []).filter((s) => s.proyecto === nombre);
  const viva = sesiones.find((s) => s.estado !== 'terminada');
  const activas = (datos?.sesiones ?? []).filter((s) => s.estado !== 'terminada').length;
  // continuar: retoma la última conversación de Claude en este proyecto (p. ej. tras una actualización).
  const abrir = (continuar = false, sesionCodex = null) => intentar(async () => {
    setAbriendo(true);
    try { const s = await post('/api/remoto/abrir', { proyecto: nombre, cols: 120, filas: 36, continuar, ia: sesionCodex ? 'codex' : ia, sesionCodex, perfil: (sesionCodex || ia === 'codex') ? null : perfil }); window.location.hash = enlaceTerminal(s); } finally { setAbriendo(false); recargar(); }
  });
  const cerrar = (id) => intentar(async () => { await post(`/api/remoto/${id}/cerrar`); recargar(); });
  if (!datos) return null;
  return (
    <div>
      {aviso}
      <Fallo error={fallo} className="mb-3" />
      {sesiones.length > 0 ? (
        <div className="space-y-3">{sesiones.map((s) => <TarjetaSesion key={s.id} s={s} alCerrar={cerrar} />)}</div>
      ) : null}
      {!viva && (datos.historialCodex ?? []).filter((s) => s.proyecto === nombre).map((s) => (
        <div key={s.id} className="my-3 flex flex-wrap items-center gap-3 rounded border border-borde p-3 text-sm">
          <span>Codex {s.relevo ? '· relevo' : ''} · {s.inicio} · {s.id.slice(0, 8)}</span>
          <Boton disabled={abriendo || s.enCurso || datos.terminal === false || activas >= datos.maxTotal} onClick={() => abrir(true, s.id)}>{s.enCurso ? 'Relevo en curso' : 'Continuar sesión'}</Boton>
        </div>
      ))}
      {!viva && (
        <div className={cx('flex flex-wrap items-center gap-3 rounded-2xl border border-borde bg-panel/80 p-4', sesiones.length > 0 && 'mt-3')}>
          <SquareTerminal className="size-5 text-raptor" />
          <p className="min-w-0 flex-1 basis-[calc(100%-2.75rem)] text-[13px] text-tenue sm:basis-0">
            {datos.terminal === false ? 'Desde la red de casa con solo el código no se abre la terminal.'
              : activas >= datos.maxTotal ? `Ya hay ${activas} sesiones abiertas (el máximo): cierra alguna.`
                : 'Trabaja con Claude o Codex desde la terminal de este proyecto.'}
          </p>
          <label className="text-sm">IA <select aria-label="IA de desarrollo" value={ia} onChange={(e) => setIa(e.target.value)} className="rounded bg-panel p-2"><option value="claude">Claude</option><option value="codex">Codex</option></select></label>
          {ia === 'claude' && <SelectorPerfil valor={perfil} alCambiar={setPerfil} className="w-full sm:max-w-sm"
            nota={perfil === 'director' ? 'Coordina al equipo (Producto, Arquitectura, Desarrollo, Calidad, Seguridad y Diseño).' : null} />}
          {/* En el móvil, los botones debajo del texto y a lo ancho (fáciles de pulsar). */}
          <div className="flex w-full gap-2 sm:w-auto">
            <Boton className="flex-1 justify-center sm:flex-none" disabled={abriendo || datos.terminal === false || activas >= datos.maxTotal} onClick={() => abrir(true)} title="Retoma la última conversación de la IA elegida en este proyecto">
              <span className="sm:hidden">Continuar</span><span className="hidden sm:inline">Continuar la anterior</span>
            </Boton>
            <Boton className="flex-1 justify-center sm:flex-none" variante="primario" disabled={abriendo || datos.terminal === false || activas >= datos.maxTotal} onClick={() => abrir(false)}>
              {abriendo ? <><Loader2 className="size-4 animate-spin" /> Abriendo…</> : 'Abrir sesión'}
            </Boton>
          </div>
        </div>
      )}
    </div>
  );
}

function Detalle({ nombre, p, recargarLista }) {
  const local = p?.local !== false;
  const { datos, error, cargando } = useDatos(local ? `/api/proyecto?nombre=${encodeURIComponent(nombre)}` : null, { cada: 3000 });
  const volver = <a href="#/proyectos" className="text-apagado hover:text-texto md:hidden" aria-label="Volver"><ArrowLeft className="size-5" /></a>;
  const titulo = (sub, acciones) => (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {volver}
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-semibold tracking-tight text-white">{nombre}</h1>
        {sub}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}</div>
    </div>
  );

  if (!local) {
    return <div className="h-full overflow-y-auto"><div className="mx-auto max-w-4xl px-4 py-6 md:px-8">{titulo(<p className="mt-0.5 text-[13px] text-apagado">Solo en la bóveda</p>)}<SoloEnBoveda p={p} recargar={recargarLista} /></div></div>;
  }
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;
  const { git, flujo } = datos;
  const vivo = Boolean(flujo.bloqueo?.vivo);
  const boveda = nombre === BOVEDA;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        {titulo(
          git && <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-apagado"><GitBranch className="size-3.5" /><span className="font-mono">{git.rama}</span>{git.sucios ? <> · <span className="text-aviso">{git.sucios} cambios sin commit</span></> : ' · limpio'}</p>,
          <>
            {vivo ? <Insignia tono="raptor"><Punto tono="raptor" vivo /> {flujo.bloqueo.id === 'plan' ? 'plan' : flujo.bloqueo.id} en curso</Insignia>
              : flujo.bloqueo ? <Insignia tono="fallo">ejecución interrumpida · «flujo recuperar»</Insignia> : null}
            <Boton tam="sm" onClick={() => ir(`chat/nuevo/${nombre}`)}><MessagesSquare className="size-3.5" /> Chat</Boton>
          </>,
        )}
        <Fallo error={error} className="mb-4" />
        <div className="space-y-6">
          {boveda ? (
            <a href="#/boveda" className="flex items-center gap-3 rounded-2xl border border-borde bg-panel/80 p-4 text-[13px] text-tenue hover:border-borde-fuerte"><BookOpen className="size-5 text-raptor" /> Explorar las notas de la bóveda →</a>
          ) : <SesionProyecto nombre={nombre} />}
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0 space-y-6">
              <Flujo flujo={flujo} nombre={nombre} />
              <Commits commits={git?.commits} />
            </div>
            {!boveda && p?.nota && <div className="min-w-0"><NotaProyecto ruta={p.nota} /></div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Proyectos({ resto }) {
  const { datos, error, recargar } = useDatos('/api/proyectos', { cada: 5000 });
  const [traer, setTraer] = useState(false);
  const [nombre, sub, id] = (resto || '').split('/');
  const elegido = nombre || null;
  if (elegido && sub === 'terminal' && id) return <VistaTerminal proyecto={elegido} id={id} />;
  const locales = (datos ?? []).filter((p) => p.local);
  const remotos = (datos ?? []).filter((p) => !p.local);
  const enLista = (p) => (
    <a key={p.nombre} href={enlace('proyectos', p.nombre)} onClick={() => setTraer(false)} className={cx('block rounded-xl px-3 py-2.5', elegido === p.nombre && !traer ? 'bg-elevado' : 'hover:bg-elevado/60')}>
      <span className="flex items-center gap-2">
        {p.local ? <Punto tono={p.flujo?.bloqueo?.vivo ? 'raptor' : p.sucios ? 'aviso' : 'apagado'} vivo={p.flujo?.bloqueo?.vivo} /> : <FolderGit2 className="size-3.5 text-apagado" />}
        <span className={cx('flex-1 truncate text-[13px]', p.local ? 'text-texto' : 'text-tenue')}>{p.nombre}</span>
        {p.flujo?.tareas > 0 && <span className="text-[11px] tabular-nums text-apagado">{p.flujo.integradas}/{p.flujo.tareas}</span>}
      </span>
      {p.local && <span className="mt-0.5 block truncate pl-4 text-[11px] text-apagado">{p.ultimo ? `${haceCuanto(p.ultimo.fecha)} · ${p.ultimo.asunto}` : p.rama}</span>}
    </a>
  );
  const principal = traer ? <div className="mx-auto max-w-xl px-4 py-6 md:px-8"><TraerProyecto alCerrar={() => setTraer(false)} alTraer={() => { setTraer(false); recargar(); }} /></div>
    : elegido ? <Detalle key={elegido} nombre={elegido} p={datos?.find((x) => x.nombre === elegido)} recargarLista={recargar} />
      : <Vacio icono={FolderGit2} titulo="Elige un proyecto" className="h-full">Abre una sesión de Claude Code, chatea, mira su nota y su flujo automático en vivo.</Vacio>;

  return (
    <div className="flex h-full">
      <aside className={cx('w-full shrink-0 flex-col border-r border-borde bg-panel/50 md:flex md:w-72', elegido || traer ? 'hidden' : 'flex')}>
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-[15px] font-semibold text-white">Proyectos</h1>
          <Boton tam="sm" variante="primario" onClick={() => setTraer(true)}><Plus className="size-3.5" /> Traer</Boton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <Fallo error={error} className="mx-2" />
          {!datos && !error && <Cargando className="px-3" />}
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">En este equipo</p>
          {locales.map(enLista)}
          {remotos.length > 0 && <p className="px-2 pt-4 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">Solo en la bóveda</p>}
          {remotos.map(enLista)}
        </div>
      </aside>
      <section className={cx('min-w-0 flex-1', !elegido && !traer && 'hidden md:block')}>{principal}</section>
    </div>
  );
}
