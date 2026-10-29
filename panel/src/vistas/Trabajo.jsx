// Trabajo: proyectos del equipo, su flujo automático en vivo (tareas y fases) y su historial de git.
import { ArrowLeft, CircleDashed, FolderGit2, GitBranch, GitCommitHorizontal, ListChecks, Terminal } from 'lucide-react';
import { duracion, enlace, haceCuanto, useDatos } from '../api.js';
import { BarraFases, LineaFases, NOMBRE_FASE } from '../componentes/Fases.jsx';
import { Cargando, cx, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';

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
        <span className="min-w-0 flex-1 truncate font-medium text-texto">{t.titulo}</span>
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

function Detalle({ nombre }) {
  const { datos, error, cargando } = useDatos(`/api/proyecto?nombre=${encodeURIComponent(nombre)}`, { cada: 3000 });
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;
  const { git, flujo } = datos;
  const vivo = Boolean(flujo.bloqueo?.vivo);
  const integradas = flujo.tareas.filter((t) => t.estado === 'integrado').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <a href="#/trabajo" className="text-apagado hover:text-texto md:hidden" aria-label="Volver"><ArrowLeft className="size-5" /></a>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-tight text-white">{nombre}</h1>
            {git && <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-apagado"><GitBranch className="size-3.5" /><span className="font-mono">{git.rama}</span>{git.sucios ? <> · <span className="text-aviso">{git.sucios} cambios sin commit</span></> : ' · limpio'}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {vivo ? <Insignia tono="raptor"><Punto tono="raptor" vivo /> {flujo.bloqueo.id === 'plan' ? 'plan' : flujo.bloqueo.id} en curso</Insignia>
              : flujo.bloqueo ? <Insignia tono="fallo">ejecución interrumpida · «flujo recuperar»</Insignia>
                : <Insignia>flujo parado</Insignia>}
            <a href={enlace('boveda', `Proyectos/${nombre}.md`)} className="text-[12px] text-apagado hover:text-raptor">Nota en la bóveda →</a>
          </div>
        </div>
        <Fallo error={error} className="mb-4" />

        <Tarjeta titulo={`Flujo automático · ${integradas}/${flujo.tareas.length} integradas`} icono={ListChecks} className="mb-6">
          {flujo.tareas.length ? (
            <ul className="space-y-2.5">{flujo.tareas.map((t) => <Tarea key={t.id} t={t} vivo={vivo} />)}</ul>
          ) : (
            <Vacio icono={CircleDashed} titulo="Sin tareas en tareas/">
              Crea tareas en <code className="font-mono">tareas/*.md</code> del proyecto y lánzalas desde la terminal con <code className="font-mono">npm run flujo -- plan</code>.
            </Vacio>
          )}
          {flujo.ramasPendientes > 0 && <p className="mt-3 text-[12px] text-aviso">{flujo.ramasPendientes} rama{flujo.ramasPendientes === 1 ? '' : 's'} flujo/… sin integrar (intentos rechazados conservados).</p>}
        </Tarjeta>

        <Tarjeta titulo="Últimos commits" icono={GitCommitHorizontal} cuerpo="px-4 py-2">
          {git?.commits?.length ? (
            <ol className="relative">
              {git.commits.map((c, i) => (
                <li key={c.hash} className="relative flex gap-3 py-2.5">
                  {i < git.commits.length - 1 && <span aria-hidden="true" className="absolute top-6 left-[4.5px] h-full w-px bg-borde" />}
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
      </div>
    </div>
  );
}

export default function Trabajo({ resto }) {
  const { datos, error } = useDatos('/api/proyectos', { cada: 5000 });
  const elegido = resto || null;
  const locales = (datos ?? []).filter((p) => p.local);
  const remotos = (datos ?? []).filter((p) => !p.local);

  return (
    <div className="flex h-full">
      <aside className={cx('w-full shrink-0 flex-col border-r border-borde bg-panel/50 md:flex md:w-72', elegido ? 'hidden' : 'flex')}>
        <h1 className="px-4 py-4 text-[15px] font-semibold text-white">Trabajo</h1>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <Fallo error={error} className="mx-2" />
          {!datos && !error && <Cargando className="px-3" />}
          <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">En este equipo</p>
          {locales.map((p) => (
            <a key={p.nombre} href={enlace('trabajo', p.nombre)} className={cx('block rounded-xl px-3 py-2.5', elegido === p.nombre ? 'bg-elevado' : 'hover:bg-elevado/60')}>
              <span className="flex items-center gap-2">
                <Punto tono={p.flujo?.bloqueo?.vivo ? 'raptor' : p.sucios ? 'aviso' : 'apagado'} vivo={p.flujo?.bloqueo?.vivo} />
                <span className="flex-1 truncate text-[13px] text-texto">{p.nombre}</span>
                {p.flujo?.tareas > 0 && <span className="text-[11px] tabular-nums text-apagado">{p.flujo.integradas}/{p.flujo.tareas}</span>}
              </span>
              <span className="mt-0.5 block truncate pl-4 text-[11px] text-apagado">{p.ultimo ? `${haceCuanto(p.ultimo.fecha)} · ${p.ultimo.asunto}` : p.rama}</span>
            </a>
          ))}
          {remotos.length > 0 && <p className="px-2 pt-4 pb-1 text-[11px] font-medium tracking-wider text-apagado uppercase">Solo en la memoria</p>}
          {remotos.map((p) => (
            <a key={p.nombre} href={p.nota ? enlace('boveda', p.nota) : '#/trabajo'} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-tenue hover:bg-elevado/60">
              <FolderGit2 className="size-3.5 text-apagado" /> <span className="flex-1 truncate">{p.nombre}</span>
            </a>
          ))}
        </div>
      </aside>
      <section className={cx('min-w-0 flex-1', !elegido && 'hidden md:block')}>
        {elegido ? <Detalle key={elegido} nombre={elegido} /> : (
          <Vacio icono={FolderGit2} titulo="Elige un proyecto" className="h-full">Verás su flujo automático en vivo (tareas, fases, registro) y sus últimos commits.</Vacio>
        )}
      </section>
    </div>
  );
}
