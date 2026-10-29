// Remoto: sesiones de Claude Code Remote Control en los proyectos del equipo, para seguir desde claude.ai/code o el
// móvil. El panel solo las abre y las cierra; el QR se dibuja aquí (sin servicios externos).
import { ExternalLink, FolderGit2, MonitorSmartphone, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { duracion, post, useDatos } from '../api.js';
import { Boton, Cabecera, Cargando, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';

const ESTADO = {
  conectando: { tono: 'aviso', texto: 'conectando' },
  conectada: { tono: 'ok', texto: 'conectada' },
  terminada: { tono: 'neutro', texto: 'terminada' },
};

function Qr({ texto }) {
  const qr = useMemo(() => { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q; }, [texto]);
  const n = qr.getModuleCount();
  const celdas = [];
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) celdas.push(`M${c + 2} ${f + 2}h1v1h-1z`);
  return (
    <svg viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="Código QR de la sesión" className="size-40 shrink-0 rounded-lg bg-white" shapeRendering="crispEdges">
      <path d={celdas.join('')} fill="#000" />
    </svg>
  );
}

function Sesion({ s, alCerrar }) {
  const [cerrando, setCerrando] = useState(false);
  const e = ESTADO[s.estado] ?? ESTADO.terminada;
  const url = s.url ?? s.entorno;
  const cerrar = async () => { setCerrando(true); try { await alCerrar(s.id); } finally { setCerrando(false); } };
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-borde bg-elevado/40 p-4 sm:flex-row">
      {url && s.estado !== 'terminada' ? <Qr texto={url} /> : (
        <div className="flex size-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-borde-fuerte text-[12px] text-apagado">
          {s.estado === 'terminada' ? 'Sin sesión' : <Cargando texto="Esperando URL…" />}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Punto tono={e.tono === 'ok' ? 'ok' : e.tono === 'aviso' ? 'aviso' : 'apagado'} vivo={s.estado === 'conectando'} />
          <p className="min-w-0 flex-1 truncate font-medium text-white">{s.proyecto}</p>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
        </div>
        <p className="text-[12px] text-apagado">
          {s.estado === 'terminada' ? (s.motivo ?? 'Terminada.') : `Abierta hace ${duracion(Date.now() - Date.parse(s.inicio))}`}
        </p>
        {url && s.estado !== 'terminada' && (
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] break-all text-raptor hover:underline">
            <ExternalLink className="size-3.5 shrink-0" /> {url}
          </a>
        )}
        <p className="text-[12px] text-apagado">Escanea el QR con el móvil o abre el enlace. Los permisos se aprueban desde la app.</p>
        <Boton variante={s.estado === 'terminada' ? 'fantasma' : 'peligro'} tam="sm" className="mt-auto self-start" disabled={cerrando} onClick={cerrar}>
          <X className="size-3.5" /> {s.estado === 'terminada' ? 'Quitar' : 'Cerrar'}
        </Boton>
      </div>
    </li>
  );
}

export default function Remoto() {
  const { datos, error, cargando, recargar } = useDatos('/api/remoto', { cada: 2000 });
  const proyectos = useDatos('/api/proyectos');
  const [abriendo, setAbriendo] = useState(null);
  const [fallo, setFallo] = useState(null);

  const accion = async (fn) => { setFallo(null); try { await fn(); } catch (e) { setFallo(e); } finally { setAbriendo(null); recargar(); } };
  const abrir = (proyecto) => { setAbriendo(proyecto); return accion(() => post('/api/remoto/abrir', { proyecto })); };
  const cerrar = (id) => accion(() => post(`/api/remoto/${id}/cerrar`));

  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  const sesiones = datos?.sesiones ?? [];
  const activas = sesiones.filter((s) => s.estado !== 'terminada');
  const locales = (proyectos.datos ?? []).filter((p) => p.local && p.nombre !== 'Bóveda'); // la bóveda no es un proyecto de TRABAJO_DIR
  const lleno = activas.length >= (datos?.maxTotal ?? 3);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo="Remoto" subtitulo="Claude Code en un proyecto del equipo, manejado desde claude.ai/code o la app del móvil" />
        <Fallo error={fallo ?? error ?? proyectos.error} className="mb-4" />

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Tarjeta titulo={`Sesiones abiertas · ${activas.length}/${datos?.maxTotal ?? 3}`} icono={MonitorSmartphone}>
            {sesiones.length ? (
              <ul className="space-y-3">{sesiones.map((s) => <Sesion key={s.id} s={s} alCerrar={cerrar} />)}</ul>
            ) : (
              <Vacio icono={MonitorSmartphone} titulo="Ninguna sesión remota">
                Abre una en un proyecto. Se cierra sola a las 4 h y todas se cierran al parar el panel.
              </Vacio>
            )}
          </Tarjeta>

          <Tarjeta titulo="Proyectos" icono={FolderGit2} cuerpo="p-2">
            {locales.length ? (
              <ul>
                {locales.map((p) => {
                  const abierta = activas.some((s) => s.proyecto === p.nombre);
                  return (
                    <li key={p.nombre} className="flex items-center gap-2 rounded-xl px-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-[13px]">{p.nombre}</span>
                      {abierta ? <Insignia tono="ok">abierta</Insignia> : (
                        <Boton tam="sm" variante="primario" disabled={lleno || abriendo !== null} onClick={() => abrir(p.nombre)}>
                          {abriendo === p.nombre ? 'Abriendo…' : 'Abrir sesión remota'}
                        </Boton>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : <Vacio titulo="Sin proyectos en este equipo" />}
            {lleno && <p className="px-3 pb-2 text-[12px] text-apagado">Máximo de sesiones alcanzado: cierra alguna.</p>}
          </Tarjeta>
        </div>
      </div>
    </div>
  );
}
