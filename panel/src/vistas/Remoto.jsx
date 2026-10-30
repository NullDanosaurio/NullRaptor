// Remoto: Claude Code en un proyecto del equipo, en una terminal del panel y a la vez desde claude.ai/code o el
// móvil (Remote Control). #/remoto lista sesiones y proyectos; #/remoto/<id> abre la terminal de una sesión.
// Por Tailscale, la terminal y la gestión de passkeys piden confirmar la passkey (vale una hora).
import { ArrowLeft, ExternalLink, FolderGit2, KeyRound, LogOut, MonitorSmartphone, ShieldCheck, SquareTerminal, Trash2, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { confirmarPasskey, duracion, enlace, haceCuanto, post, useDatos } from '../api.js';
import Terminal from '../componentes/Terminal.jsx';
import { Boton, Cabecera, Cargando, Fallo, Insignia, Punto, Tarjeta, Vacio } from '../componentes/ui.jsx';

const ESTADO = {
  conectando: { tono: 'aviso', punto: 'aviso', texto: 'conectando' },
  conectada: { tono: 'ok', punto: 'ok', texto: 'conectada' },
  terminada: { tono: 'neutro', punto: 'apagado', texto: 'terminada' },
};

function Qr({ texto, className = 'size-40' }) {
  const qr = useMemo(() => { const q = qrcode(0, 'M'); q.addData(texto); q.make(); return q; }, [texto]);
  const n = qr.getModuleCount();
  const celdas = [];
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) celdas.push(`M${c + 2} ${f + 2}h1v1h-1z`);
  return (
    <svg viewBox={`0 0 ${n + 4} ${n + 4}`} role="img" aria-label="Código QR" className={`${className} shrink-0 rounded-lg bg-white`} shapeRendering="crispEdges">
      <path d={celdas.join('')} fill="#000" />
    </svg>
  );
}

/** Pide la passkey con un toque (Safari no la deja pedir sin él) y repite la acción. */
function usePasskey(setFallo) {
  const [pendiente, setPendiente] = useState(null);
  const intentar = async (fn) => {
    setFallo(null);
    try { await fn(); } catch (e) { if (e.reautenticar) setPendiente(() => fn); else setFallo(e); }
  };
  const confirmar = async () => {
    try { await confirmarPasskey(); const fn = pendiente; setPendiente(null); await intentar(fn); } catch (e) { setFallo(e.name === 'NotAllowedError' ? new Error('Cancelado.') : e); }
  };
  const aviso = pendiente && (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-aviso/25 bg-aviso/10 px-3 py-2 text-[13px] text-aviso">
      <KeyRound className="size-4 shrink-0" /><span className="flex-1">Para esto, confirma que eres tú con tu passkey.</span>
      <Boton tam="sm" variante="primario" onClick={confirmar}>Confirmar</Boton>
    </div>
  );
  return { intentar, aviso };
}

function Sesion({ s, alCerrar }) {
  const e = ESTADO[s.estado] ?? ESTADO.terminada;
  const viva = s.estado !== 'terminada';
  return (
    <li className="flex flex-col gap-4 rounded-2xl border border-borde bg-elevado/40 p-4 sm:flex-row">
      {s.url && viva ? <Qr texto={s.url} /> : (
        <div className="flex size-40 shrink-0 items-center justify-center rounded-lg border border-dashed border-borde-fuerte text-[12px] text-apagado">
          {viva ? <Cargando texto="Esperando URL…" /> : 'Sin sesión'}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Punto tono={e.punto} vivo={s.estado === 'conectando'} />
          <p className="min-w-0 flex-1 truncate font-medium text-white">{s.proyecto}</p>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
        </div>
        <p className="text-[12px] text-apagado">
          {viva ? `Abierta hace ${duracion(Date.now() - Date.parse(s.inicio))} · ${s.quien}` : (s.motivo ?? 'Terminada.')}
        </p>
        {s.url && viva && (
          <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] break-all text-raptor hover:underline">
            <ExternalLink className="size-3.5 shrink-0" /> {s.url}
          </a>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {viva && <a href={enlace('remoto', s.id)}><Boton tam="sm" variante="primario"><SquareTerminal className="size-3.5" /> Ver terminal</Boton></a>}
          <Boton variante={viva ? 'peligro' : 'fantasma'} tam="sm" onClick={() => alCerrar(s.id)}><X className="size-3.5" /> {viva ? 'Cerrar' : 'Quitar'}</Boton>
        </div>
      </div>
    </li>
  );
}

function Seguridad({ intentar }) {
  const { datos, recargar } = useDatos('/api/seguridad');
  const [alta, setAlta] = useState(null);
  if (!datos) return null; // sin Tailscale (404) no hay nada que gestionar
  const sacarAlta = () => intentar(async () => setAlta(await post('/api/seguridad/alta')));
  const borrar = (id) => intentar(async () => { await post('/api/seguridad/borrar', { id }); recargar(); });
  const salir = async () => { await post('/api/seguridad/salir'); window.location.assign('/entrar'); };
  return (
    <Tarjeta titulo="Seguridad · passkeys" icono={ShieldCheck} cuerpo="p-3" accion={datos.remota && <Boton tam="sm" variante="fantasma" onClick={salir}><LogOut className="size-3.5" /> Salir</Boton>}>
      <p className="px-1 pb-2 text-[12px] text-apagado">Desde fuera: <span className="font-mono text-tenue">https://{datos.dominio}</span></p>
      <ul className="space-y-1">
        {datos.passkeys.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-[13px]">
            <KeyRound className="size-3.5 shrink-0 text-apagado" />
            <span className="min-w-0 flex-1 truncate">{p.nombre}{p.id === datos.actual && <span className="text-apagado"> (esta)</span>}</span>
            <span className="text-[11px] text-apagado">{p.usada ? haceCuanto(p.usada) : 'sin usar'}</span>
            {datos.passkeys.length > 1 && <Boton tam="icono" variante="fantasma" aria-label={`Borrar ${p.nombre}`} onClick={() => borrar(p.id)}><Trash2 className="size-3.5" /></Boton>}
          </li>
        ))}
        {!datos.passkeys.length && <li className="px-2 text-[12px] text-apagado">Ninguna todavía: la primera se crea en https://{datos.dominio}/entrar con el código del lanzador.</li>}
      </ul>
      {alta ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-borde p-3 text-center">
          <Qr texto={alta.url} className="size-36" />
          <p className="font-mono text-[15px] tracking-wider text-white">{alta.codigo}</p>
          <p className="text-[11px] text-apagado">Abre el QR en el dispositivo nuevo (con Tailscale). Un solo uso, caduca {haceCuanto(alta.expira)}.</p>
          <Boton tam="sm" variante="fantasma" onClick={() => setAlta(null)}>Hecho</Boton>
        </div>
      ) : datos.passkeys.length > 0 && <Boton tam="sm" className="mt-3" onClick={sacarAlta}>Añadir otro dispositivo</Boton>}
    </Tarjeta>
  );
}

export default function Remoto({ resto }) {
  const { datos, error, cargando, recargar } = useDatos('/api/remoto', { cada: 2000 });
  const proyectos = useDatos(resto ? null : '/api/proyectos');
  const [abriendo, setAbriendo] = useState(null);
  const [fallo, setFallo] = useState(null);
  const { intentar, aviso } = usePasskey(setFallo);

  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  const sesiones = datos?.sesiones ?? [];

  if (resto) {
    const s = sesiones.find((x) => x.id === resto);
    return (
      <div className="flex h-full flex-col gap-3 p-3 md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <a href="#/remoto" className="flex items-center gap-1.5 text-[13px] text-apagado hover:text-raptor"><ArrowLeft className="size-4" /> Remoto</a>
          <p className="min-w-0 flex-1 truncate font-medium text-white">{s?.proyecto ?? 'Sesión'}</p>
          {s?.url && <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-raptor hover:underline"><ExternalLink className="size-3.5" /> claude.ai</a>}
        </div>
        <Terminal id={resto} className="flex-1" />
      </div>
    );
  }

  const activas = sesiones.filter((s) => s.estado !== 'terminada');
  const locales = (proyectos.datos ?? []).filter((p) => p.local && p.nombre !== 'Bóveda'); // la bóveda no es un proyecto de TRABAJO_DIR
  const lleno = activas.length >= (datos?.maxTotal ?? 3);
  const abrir = (proyecto) => intentar(async () => {
    setAbriendo(proyecto);
    try { const s = await post('/api/remoto/abrir', { proyecto, cols: 120, filas: 36 }); window.location.hash = enlace('remoto', s.id); } finally { setAbriendo(null); recargar(); }
  });
  const cerrar = (id) => intentar(async () => { await post(`/api/remoto/${id}/cerrar`); recargar(); });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo="Remoto" subtitulo="Claude Code en un proyecto del equipo: en la terminal del panel y en claude.ai/code o el móvil" />
        {aviso}
        <Fallo error={fallo ?? error ?? proyectos.error} className="mb-4" />
        {datos && !datos.terminal && <p className="mb-4 rounded-xl border border-borde px-3 py-2 text-[13px] text-apagado">Desde la red de casa con código no se abre la terminal: úsala desde este equipo o por Tailscale con passkey.</p>}

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Tarjeta titulo={`Sesiones abiertas · ${activas.length}/${datos?.maxTotal ?? 3}`} icono={MonitorSmartphone}>
            {sesiones.length ? (
              <ul className="space-y-3">{sesiones.map((s) => <Sesion key={s.id} s={s} alCerrar={cerrar} />)}</ul>
            ) : (
              <Vacio icono={MonitorSmartphone} titulo="Ninguna sesión remota">
                Claude pregunta antes de cada acción. Se cierra sola a las 4 h y todas al parar el panel.
              </Vacio>
            )}
          </Tarjeta>

          <div className="space-y-6">
            <Tarjeta titulo="Proyectos" icono={FolderGit2} cuerpo="p-2">
              {locales.length ? (
                <ul>
                  {locales.map((p) => {
                    const abierta = activas.some((s) => s.proyecto === p.nombre);
                    return (
                      <li key={p.nombre} className="flex items-center gap-2 rounded-xl px-3 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13px]">{p.nombre}</span>
                        {abierta ? <Insignia tono="ok">abierta</Insignia> : (
                          <Boton tam="sm" variante="primario" disabled={lleno || abriendo !== null || datos?.terminal === false} onClick={() => abrir(p.nombre)}>
                            {abriendo === p.nombre ? 'Abriendo…' : 'Abrir sesión'}
                          </Boton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : <Vacio titulo="Sin proyectos en este equipo" />}
              {lleno && <p className="px-3 pb-2 text-[12px] text-apagado">Máximo de sesiones alcanzado: cierra alguna.</p>}
            </Tarjeta>
            <Seguridad intentar={intentar} />
          </div>
        </div>
      </div>
    </div>
  );
}
