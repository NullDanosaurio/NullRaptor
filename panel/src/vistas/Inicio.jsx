// Inicio: todo de un vistazo — proyectos y su flujo, cambios de la bóveda, chats y MCP del día.
import { ArrowUpRight, BookOpen, FolderGit2, GitCommitHorizontal, MessagesSquare, MonitorSmartphone, Plug, Sparkles } from 'lucide-react';
import { enlace, haceCuanto, useDatos } from '../api.js';
import { Cabecera, Cargando, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';

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
    <a href={p.local ? enlace('trabajo', p.nombre) : p.nota ? enlace('boveda', p.nota) : '#/trabajo'} className="group flex flex-col gap-3 rounded-2xl border border-borde bg-elevado/40 p-4 transition-colors hover:border-borde-fuerte hover:bg-elevado/70">
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
        <p className="text-[12px] text-apagado">{p.local ? 'Sin tareas en el flujo' : p.repo ? 'Se descarga al elegirlo en el menú' : ''}</p>
      )}
      {p.ultimo && <p className="truncate border-t border-borde pt-2.5 text-[12px] text-apagado"><span className="font-mono text-tenue">{p.ultimo.hash}</span> {p.ultimo.asunto}</p>}
    </a>
  );
}

export default function Inicio() {
  const { datos, error, cargando } = useDatos('/api/resumen', { cada: 5000 });
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;

  const { proyectos, boveda, mcp, chats, guardados, remoto = [] } = datos;
  const enCurso = proyectos.filter((p) => p.flujo?.bloqueo?.vivo);
  const fecha = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo={`${saludo()}, Dano`} subtitulo={<span className="capitalize">{fecha}</span>} />
        <Fallo error={error} className="mb-4" />
        {remoto.length > 0 && (
          <a href="#/remoto" className="mb-4 flex items-center gap-2.5 rounded-xl border border-aviso/25 bg-aviso/10 px-3 py-2 text-[13px] text-aviso hover:bg-aviso/15">
            <MonitorSmartphone className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {remoto.length === 1 ? '1 sesión remota abierta' : `${remoto.length} sesiones remotas abiertas`}: {remoto.map((s) => s.proyecto).join(', ')}
            </span>
            <span className="shrink-0">Ver →</span>
          </a>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra etiqueta="Proyectos" valor={proyectos.length} detalle={`${proyectos.filter((p) => p.local).length} en este equipo`} icono={FolderGit2} href="#/trabajo" />
          <Cifra etiqueta="Flujo" valor={enCurso.length} detalle={enCurso.length ? enCurso.map((p) => p.nombre).join(', ') : 'Nada ejecutándose'} icono={Sparkles} href="#/trabajo" />
          <Cifra etiqueta="Notas en la bóveda" valor={boveda?.notas ?? '—'} detalle={boveda?.cambios?.[0] ? `Último cambio ${haceCuanto(boveda.cambios[0].fecha)}` : 'Sin bóveda'} icono={BookOpen} href="#/boveda" />
          <Cifra etiqueta="Chats" valor={chats.length} detalle={chats.length ? 'abiertos ahora' : `${guardados.length} guardados recientes`} icono={MessagesSquare} href="#/chat" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            <Tarjeta titulo="Proyectos" icono={FolderGit2} accion={<a href="#/trabajo" className="text-[12px] text-apagado hover:text-raptor">Ver trabajo →</a>}>
              {proyectos.length ? (
                <div className="grid gap-3 sm:grid-cols-2">{proyectos.map((p) => <TarjetaProyecto key={p.nombre} p={p} />)}</div>
              ) : <Vacio icono={FolderGit2} titulo="Aún no hay proyectos">Elige o crea uno desde el menú de la terminal.</Vacio>}
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
                    <li key={c.id}><a href={enlace('chat', c.id)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-elevado/70"><Punto tono="raptor" vivo={c.ocupado} /><span className="flex-1 truncate text-[13px]">{c.proyecto}</span><span className="text-[11px] text-apagado">{c.mensajes} mensajes</span></a></li>
                  ))}
                  {guardados.map((g) => (
                    <li key={g.archivo}><a href={enlace('chat', `guardado/${g.archivo}`)} className="flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-elevado/70"><Punto tono="apagado" /><span className="flex-1 truncate text-[13px] text-tenue">{g.proyecto}</span><span className="text-[11px] text-apagado">{haceCuanto(g.cambiado)}</span></a></li>
                  ))}
                </ul>
              ) : <Vacio titulo="Sin chats todavía">Habla con Claude y Codex a la vez sobre un proyecto.</Vacio>}
            </Tarjeta>
          </div>
        </div>
      </div>
    </div>
  );
}
