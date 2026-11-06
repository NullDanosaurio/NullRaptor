// Resumen: todo de un vistazo — sesiones abiertas, proyectos y su flujo, la bóveda (buscar y últimos cambios),
// chats, MCP del día, las tareas de la IA (Ruflo) y el relevo a Codex cuando Claude se queda sin tokens.
import { ArrowUpRight, ArrowRightLeft, BookOpen, DatabaseBackup, Gauge, ListChecks, FolderGit2, GitCommitHorizontal, MessagesSquare, MonitorSmartphone, Plug, Search, Sparkles, SquareTerminal, X } from 'lucide-react';
import { useState } from 'react';
import { enlace, haceCuanto, useDatos } from '../api.js';
import { enlaceTerminal } from '../componentes/Sesiones.jsx';
import { Avatar, Cabecera, Cargando, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';
import { Busqueda } from './Boveda.jsx';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

function Cifra({ etiqueta, valor, detalle, icono: Icono, href }) {
  return (
    <a href={href} className="group rounded-2xl border border-borde bg-panel/80 p-4 transition-colors hover:border-borde-fuerte">
      <div className="flex items-center justify-between text-[12px] text-apagado">
        {etiqueta} <Icono className="size-4 transition-colors group-hover:text-raptor" strokeWidth={1.8} />
      </div>
      <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight text-white">{valor}</p>
      <p className="truncate text-[12px] text-apagado">{detalle}</p>
    </a>
  );
}

function TarjetaProyecto({ p }) {
  const f = p.flujo;
  const pct = f?.tareas ? Math.round((f.integradas / f.tareas) * 100) : 0;
  const vivo = f?.bloqueo?.vivo;
  return (
    <a href={enlace('proyectos', p.nombre)} className="group flex flex-col gap-3 rounded-2xl border border-borde bg-elevado/40 p-4 transition-colors hover:border-borde-fuerte hover:bg-elevado/70">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">{p.nombre}</p>
          <p className="truncate text-[12px] text-apagado">
            {p.local ? <><span className="font-mono">{p.rama}</span>{p.sucios ? ` · ${p.sucios} cambios sin commit` : ''}</> : 'Solo en la memoria (no descargado)'}
          </p>
        </div>
        <ArrowUpRight className="ml-auto size-4 shrink-0 text-apagado transition-colors group-hover:text-raptor" />
      </div>
      {f && f.tareas > 0 ? (
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 text-tenue">{vivo && <Punto tono="raptor" vivo />}{vivo ? `${f.enCurso ?? f.bloqueo.id} en curso` : 'Flujo parado'}</span>
            <span className="tabular-nums text-apagado">{f.integradas}/{f.tareas}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-borde"><div className="h-full rounded-full bg-raptor/80 transition-[width] duration-500" style={{ width: `${pct}%` }} /></div>
        </div>
      ) : (
        <p className="text-[12px] text-apagado">{p.local ? 'Sin tareas en el flujo' : p.repo ? 'Se descarga desde Proyectos' : ''}</p>
      )}
      {p.ultimo && <p className="truncate border-t border-borde pt-2.5 text-[12px] text-apagado"><span className="font-mono text-tenue">{p.ultimo.hash}</span> {p.ultimo.asunto}</p>}
    </a>
  );
}

/** Buscador de la bóveda: los resultados abren la nota. */
function BuscarBoveda() {
  const [consulta, setConsulta] = useState('');
  return (
    <Tarjeta titulo="Bóveda" icono={BookOpen} cuerpo="p-2" accion={<a href="#/boveda" className="text-[12px] text-apagado hover:text-raptor">Explorar →</a>}>
      <label className="mx-1 mb-1 flex h-9 items-center gap-2 rounded-xl border border-borde bg-elevado/60 px-3 focus-within:border-raptor/40">
        <Search className="size-4 text-apagado" />
        <input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar en las notas…" aria-label="Buscar en la bóveda" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-apagado" />
        {consulta && <button type="button" onClick={() => setConsulta('')} aria-label="Borrar búsqueda" className="text-apagado hover:text-texto"><X className="size-3.5" /></button>}
      </label>
      {consulta && <div className="max-h-80 overflow-y-auto"><Busqueda consulta={consulta} /></div>}
    </Tarjeta>
  );
}

/** Gasto de tokens de Claude de los últimos 7 días (estimado con precios de API): para ver si un cambio ahorra. */
function GastoIA() {
  const { datos } = useDatos('/api/gasto?dias=7', { cada: 120_000 });
  if (!datos?.llamadas) return null;
  const max = Math.max(...datos.porDia.map((d) => d.usd), 1);
  const miles = (n) => `${Math.round(n / 1000)} k`;
  return (
    <Tarjeta titulo="Gasto de Claude · 7 días" icono={Gauge} accion={<span className="text-[11px] text-apagado" title="Estimado con precios de API: da la proporción, no lo que se paga con la suscripción">estimado</span>}>
      <p className="text-[24px] font-semibold tabular-nums text-white">~{Math.round(datos.usd)} USD <span className="text-[13px] font-normal text-apagado">· {datos.llamadas} llamadas</span></p>
      <div className="mt-3 flex h-16 items-end gap-1" aria-label="Gasto por día">
        {datos.porDia.map((d) => (
          <div key={d.nombre} className="flex flex-1 flex-col items-center gap-1" title={`${d.nombre}: ~${d.usd} USD`}>
            <div className="w-full rounded-t bg-raptor/70" style={{ height: `${Math.max(4, (d.usd / max) * 52)}px` }} />
            <span className="text-[10px] tabular-nums text-apagado">{d.nombre.slice(8)}</span>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-[12px] text-tenue">
        <li>Modelos: {datos.porModelo.slice(0, 3).map((m) => `${m.nombre.replace(/-\d.*$/, '')} ${m.pct} %`).join(' · ')}</li>
        <li>Releer contexto: <span className="text-texto">{datos.partes.leer} %</span> · respuestas {datos.partes.salida} %</li>
        <li>Contexto por llamada: mediana {miles(datos.contexto.mediana)} · p90 {miles(datos.contexto.p90)} tokens</li>
      </ul>
    </Tarjeta>
  );
}

const ESTADO_RELEVO = {
  'en curso': { tono: 'raptor', texto: (r) => `Claude se quedó sin tokens: Codex sigue con ${r.proyecto}` },
  terminado: { tono: 'ok', texto: (r) => `Codex terminó su turno en ${r.proyecto}: Claude lo revisará al volver` },
  error: { tono: 'fallo', texto: (r) => `El relevo de Codex en ${r.proyecto} se detuvo${r.error === 'interrumpido' ? ' (interrumpido)' : ''}` },
};

function DetalleRelevo({ proyecto }) {
  const { datos, error } = useDatos(`/api/relevo?proyecto=${encodeURIComponent(proyecto)}`, { cada: 5000 });
  if (!datos) return <p className="mt-2 text-[11px] text-apagado">{error ? 'No se pudo leer el registro.' : 'Cargando…'}</p>;
  return (
    <div className="mt-2 space-y-2">
      {datos.resumen && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-texto">{datos.resumen}</pre>}
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] text-apagado">{datos.registro || 'Sin registro todavía.'}</pre>
    </div>
  );
}

/** Relevo a Codex: qué proyectos sigue Codex (o siguió) por falta de tokens de Claude, con su resumen y registro. */
function RelevoCodex({ relevos }) {
  const [abierto, setAbierto] = useState(null);
  if (!relevos?.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {relevos.map((r) => {
        const e = ESTADO_RELEVO[r.estado] ?? ESTADO_RELEVO.error;
        return (
          <div key={r.proyecto} className="rounded-xl border border-borde bg-panel/80 px-3 py-2 text-[13px] text-texto">
            <div className="flex items-center gap-2.5">
              <ArrowRightLeft className="size-4 shrink-0 text-apagado" />
              <span className="min-w-0 flex-1">{e.texto(r)} <span className="text-[11px] text-apagado">· {haceCuanto(r.fin ?? r.inicio)}</span></span>
              <Punto tono={e.tono} vivo={r.estado === 'en curso'} />
              <button type="button" onClick={() => setAbierto(abierto === r.proyecto ? null : r.proyecto)} aria-expanded={abierto === r.proyecto}
                className="h-9 rounded-lg border border-borde px-3 text-[12px] text-tenue hover:text-texto">{abierto === r.proyecto ? 'Ocultar' : 'Ver registro'}</button>
            </div>
            {abierto === r.proyecto && <DetalleRelevo proyecto={r.proyecto} />}
          </div>
        );
      })}
    </div>
  );
}

const AVISO_COPIA = {
  'sin-clave': 'Aún no hay copia de seguridad: falta crear la clave (node scripts/copia.mjs clave <ruta fuera del volumen>).',
  error: 'La última copia de seguridad falló',
  atrasada: 'La copia de seguridad va atrasada',
};

/** Copia de seguridad cifrada del volumen. Solo aparece si hay algo que decir: un fallo, atraso, falta de clave o proyectos sin subir. */
function CopiaSeguridad({ copias }) {
  if (!copias) return null;
  const sinSubir = copias.sinSubir ?? [];
  const hace = copias.horas == null ? '' : copias.horas < 1 ? 'hace menos de 1 h' : `hace ${Math.round(copias.horas)} h`;
  const texto = copias.corriendo ? 'Haciendo la copia de seguridad…' : copias.aviso ? AVISO_COPIA[copias.aviso] : `Copia de seguridad al día: la última, ${hace}.`;
  return (
    <div className={`mb-4 rounded-xl border px-3 py-2 text-[13px] ${copias.aviso ? 'border-aviso/25 bg-aviso/10 text-aviso' : 'border-borde bg-panel/80 text-texto'}`}>
      {texto && <p className="flex items-center gap-2.5"><DatabaseBackup className="size-4 shrink-0" />{texto}{copias.error ? `: ${copias.error}` : ''}{copias.horas != null && copias.aviso === 'atrasada' ? ` (hace ${copias.horas} h)` : ''}</p>}
      {sinSubir.length > 0 && (
        <p className={`flex items-start gap-2.5 ${texto ? 'mt-1.5' : ''}`}><DatabaseBackup className="mt-0.5 size-4 shrink-0" />
          <span>Sin subir a GitHub (la copia no incluye proyectos): {sinSubir.map((p) => `${p.proyecto} (${p.sinSubir == null ? 'sin remoto' : `${p.sinSubir} commits`}${p.sucios ? `, ${p.sucios} cambios` : ''})`).join(' · ')}</span></p>
      )}
    </div>
  );
}

/** Avance por proyecto: hechas/total de Ruflo y si la sesión trabaja, espera o está parada. */
function Avance({ avance }) {
  const filas = Object.entries(avance ?? {}).sort(([, a], [, b]) => (a.estado === 'parada' ? 0 : 1) - (b.estado === 'parada' ? 0 : 1) || b.enCurso - a.enCurso);
  if (!filas.length) return null;
  const tono = { trabajando: 'raptor', esperando: 'neutro', parada: 'aviso' };
  return (
    <ul className="mb-4 space-y-2.5" aria-label="Avance por proyecto">
      {filas.map(([p, a]) => (
        <li key={p} className="flex items-center gap-3 px-2">
          <span className="w-28 shrink-0 truncate text-[13px] text-texto">{p}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-elevado" role="progressbar" aria-valuemin={0} aria-valuemax={a.total} aria-valuenow={a.hechas}>
            <div className="h-full rounded-full bg-raptor transition-all" style={{ width: `${a.total ? Math.round((a.hechas / a.total) * 100) : 0}%` }} />
          </div>
          <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-tenue">{a.hechas}/{a.total}</span>
          <Insignia tono={tono[a.estado]} className="shrink-0">
            {a.estado === 'trabajando' && <Punto tono="raptor" vivo />}
            {a.estado === 'parada' ? `parada${a.hace != null ? ` hace ${Math.max(1, Math.round(a.hace / 60))} min` : ''}` : a.estado}
          </Insignia>
        </li>
      ))}
    </ul>
  );
}

/** Tareas que la IA lleva en Ruflo: en curso y pendientes, con su proyecto. */
function TareasIA({ tareas }) {
  const [filtro, setFiltro] = useState(null);
  if (!tareas) return null;
  const proyectos = Object.entries(tareas.porProyecto).sort(([, a], [, b]) => (b.enCurso + b.pendientes) - (a.enCurso + a.pendientes));
  const lista = tareas.abiertas.filter((t) => !filtro || t.proyecto === filtro);
  const chip = (id, texto, n) => (
    <button key={id ?? 'todas'} type="button" onClick={() => setFiltro(id)} aria-pressed={filtro === id}
      className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] ${filtro === id ? 'border-raptor/40 bg-raptor/10 text-white' : 'border-borde text-tenue hover:text-texto'}`}>
      {texto}<span className="tabular-nums text-apagado">{n}</span>
    </button>
  );
  return (
    <Tarjeta titulo="Tareas de la IA" icono={ListChecks} accion={<span className="text-[11px] text-apagado">{tareas.hechasHoy} hechas hoy</span>}>
      <Avance avance={tareas.avance} />
      {tareas.totalAbiertas ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {chip(null, 'Todas', tareas.totalAbiertas)}
            {proyectos.map(([p, c]) => chip(p, p, c.enCurso + c.pendientes))}
          </div>
          <ul className="space-y-1">
            {lista.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2">
                <span className="mt-1.5 flex"><Punto tono={t.estado === 'en curso' ? 'raptor' : 'apagado'} vivo={t.estado === 'en curso'} /></span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[13px] leading-snug text-texto">{t.texto}</p>
                  <p className="mt-0.5 text-[11px] text-apagado">{t.proyecto ?? 'Sin proyecto'} · {t.estado} · {haceCuanto(t.creada)}</p>
                </div>
              </li>
            ))}
          </ul>
          {tareas.totalAbiertas > tareas.abiertas.length && !filtro && <p className="mt-2 px-2 text-[11px] text-apagado">Y {tareas.totalAbiertas - tareas.abiertas.length} más.</p>}
        </>
      ) : <Vacio icono={ListChecks} titulo="Sin tareas abiertas">{tareas.hechasHoy ? `${tareas.hechasHoy} terminadas hoy.` : 'La IA apunta aquí lo que va haciendo.'}</Vacio>}
    </Tarjeta>
  );
}

export default function Resumen() {
  const { datos, error, cargando } = useDatos('/api/resumen', { cada: 5000 });
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;

  const { proyectos, boveda, mcp, chats, guardados, remoto = [], tareas = null, relevos = [], copias = null } = datos;
  const enCurso = proyectos.filter((p) => p.flujo?.bloqueo?.vivo);
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo={`${saludo()}, Dano`} subtitulo={<span className="capitalize">{fecha}</span>} />
        <Fallo error={error} className="mb-4" />
        <RelevoCodex relevos={relevos} />
        <CopiaSeguridad copias={copias} />
        {remoto.length > 0 && (
          <div className="mb-4 rounded-xl border border-aviso/25 bg-aviso/10 px-3 py-2 text-[13px] text-aviso">
            <p className="flex items-center gap-2.5"><MonitorSmartphone className="size-4 shrink-0" />{remoto.length === 1 ? '1 sesión de Claude abierta' : `${remoto.length} sesiones de Claude abiertas`}</p>
            <ul className="mt-1.5 flex flex-wrap gap-2">
              {remoto.map((s) => (
                <li key={s.id}><a href={enlaceTerminal(s)} className="flex items-center gap-1.5 rounded-lg border border-aviso/25 px-2.5 py-1 hover:bg-aviso/15"><SquareTerminal className="size-3.5" /> {s.proyecto}</a></li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra etiqueta="Proyectos" valor={proyectos.length} detalle={`${proyectos.filter((p) => p.local).length} en este equipo`} icono={FolderGit2} href="#/proyectos" />
          <Cifra etiqueta="Flujo" valor={enCurso.length} detalle={enCurso.length ? enCurso.map((p) => p.nombre).join(', ') : 'Nada ejecutándose'} icono={Sparkles} href="#/proyectos" />
          <Cifra etiqueta="Notas en la bóveda" valor={boveda?.notas ?? '—'} detalle={boveda?.cambios?.[0] ? `Último cambio ${haceCuanto(boveda.cambios[0].fecha)}` : 'Sin bóveda'} icono={BookOpen} href="#/boveda" />
          <Cifra etiqueta="Chats" valor={chats.length} detalle={chats.length ? 'abiertos ahora' : `${guardados.length} guardados recientes`} icono={MessagesSquare} href="#/chat" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <TareasIA tareas={tareas} />
            <Tarjeta titulo="Proyectos" icono={FolderGit2} accion={<a href="#/proyectos" className="text-[12px] text-apagado hover:text-raptor">Ver proyectos →</a>}>
              {proyectos.length ? (
                <div className="grid gap-3 sm:grid-cols-2">{proyectos.map((p) => <TarjetaProyecto key={p.nombre} p={p} />)}</div>
              ) : <Vacio icono={FolderGit2} titulo="Aún no hay proyectos">Créalo o clónalo desde Proyectos → Traer.</Vacio>}
            </Tarjeta>

            {mcp?.hoy?.length > 0 && (
              <Tarjeta titulo={`MCP recomendados · ${mcp.ultimaExploracion}`} icono={Plug} accion={<span className="text-[11px] text-apagado">Se instalan desde el menú («m»)</span>}>
                <div className="grid gap-3 md:grid-cols-3">
                  {mcp.hoy.map((s) => (
                    <div key={s.id} className="flex flex-col gap-2 rounded-xl border border-borde bg-elevado/40 p-3.5">
                      <div className="flex items-start gap-2">
                        <p className="min-w-0 flex-1 font-medium leading-snug text-white">{s.titulo}</p>
                        {s.categoria && <Insignia tono={s.categoria === 'útil' ? 'raptor' : 'neutro'}>{s.categoria}</Insignia>}
                      </div>
                      <p className="line-clamp-4 text-[12px] leading-relaxed text-tenue">{s.porque ?? s.descripcion}</p>
                      {mcp.instalados.includes(s.id) && <Insignia tono="ok" className="self-start">instalado</Insignia>}
                    </div>
                  ))}
                </div>
              </Tarjeta>
            )}
          </div>

          <div className="space-y-6">
            <GastoIA />
            <BuscarBoveda />
            <Tarjeta titulo="Bóveda: últimos cambios" icono={GitCommitHorizontal} cuerpo="p-2">
              {boveda?.cambios?.length ? (
                <ol>
                  {boveda.cambios.map((c) => (
                    <li key={c.hash}>
                      <a href={c.archivos[0] ? enlace('boveda', c.archivos.find((a) => a.endsWith('.md')) ?? '') : '#/boveda'} className="block rounded-xl px-3 py-2.5 hover:bg-elevado/70">
                        <p className="line-clamp-2 text-[13px] leading-snug text-texto">{c.asunto}</p>
                        <p className="mt-1 text-[11px] text-apagado"><span className="font-mono">{c.hash}</span> · {c.autor} · {haceCuanto(c.fecha)}</p>
                      </a>
                    </li>
                  ))}
                </ol>
              ) : <Vacio titulo="Sin cambios" />}
            </Tarjeta>

            <Tarjeta titulo="Chats" icono={MessagesSquare} cuerpo="p-2" accion={<a href="#/chat" className="text-[12px] text-apagado hover:text-raptor">Abrir chat →</a>}>
              {chats.length + guardados.length ? (
                <ul>
                  {chats.map((c) => (
                    <li key={c.id}><a href={enlace('chat', c.id)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-elevado/70"><Avatar quien={c.ia} className="size-5 text-[10px]" /><span className="flex-1 truncate text-[13px]">{c.proyecto}</span>{c.ocupado && <Punto tono="raptor" vivo />}<span className="text-[11px] text-apagado">{c.mensajes} mensajes</span></a></li>
                  ))}
                  {guardados.map((g) => (
                    <li key={g.archivo}><a href={enlace('chat', `guardado/${g.archivo}`)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-elevado/70"><Punto tono="apagado" /><span className="flex-1 truncate text-[13px] text-tenue">{g.proyecto}</span><span className="text-[11px] text-apagado">{haceCuanto(g.cambiado)}</span></a></li>
                  ))}
                </ul>
              ) : <Vacio titulo="Sin chats todavía">Habla con Claude o con Codex sobre un proyecto.</Vacio>}
            </Tarjeta>
          </div>
        </div>
      </div>
    </div>
  );
}
