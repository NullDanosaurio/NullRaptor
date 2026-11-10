// Resumen: todo de un vistazo — sesiones abiertas, proyectos y su flujo, la bóveda (buscar y últimos cambios),
// chats, MCP del día, las tareas de la IA (Ruflo) y el relevo a Codex cuando Claude se queda sin tokens.
import { BookOpen, FolderGit2, GitCommitHorizontal, MessagesSquare, MonitorSmartphone, Plug, Sparkles, SquareTerminal } from 'lucide-react';
import { enlace, haceCuanto, useDatos } from '../api.js';
import { enlaceTerminal } from '../componentes/Sesiones.jsx';
import { Avatar, Cabecera, Cargando, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';
import { BuscarBoveda, Cifra, CopiaSeguridad, GastoIA, RelevoCodex, TareasIA, TarjetaProyecto } from './resumen/tarjetas.jsx';

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
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
            <p className="flex items-center gap-2.5"><MonitorSmartphone className="size-4 shrink-0" />{remoto.length === 1 ? '1 sesión de desarrollo abierta' : `${remoto.length} sesiones de desarrollo abiertas`}</p>
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
