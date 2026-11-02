// Ajustes: versión y actualización, cómo se entra al panel (y las passkeys), carpetas y servidores MCP.
// El acceso y las carpetas de Windows se cambian aquí y los aplica el lanzador (componentes/AjustesEquipo.jsx).
import { Download, FolderTree, GitBranch, KeyRound, LogOut, Plug, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { haceCuanto, post, useDatos } from '../api.js';
import AjustesEquipo from '../componentes/AjustesEquipo.jsx';
import { usePasskey } from '../componentes/Passkey.jsx';
import { Qr } from '../componentes/Sesiones.jsx';
import { Boton, Cabecera, Cargando, Fallo, Insignia, Tarjeta } from '../componentes/ui.jsx';

function Fila({ etiqueta, children }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
      <dt className="w-36 shrink-0 text-[12px] text-apagado">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 text-[13px] break-words text-texto">{children}</dd>
    </div>
  );
}

function Actualizacion({ version }) {
  const { datos, recargar } = useDatos('/api/actualizacion', { cada: 60_000 });
  const [fallo, setFallo] = useState(null);
  const pedir = async () => {
    if (!window.confirm('Se cerrarán las sesiones de Claude y los chats abiertos y Nullraptor se reiniciará. ¿Actualizar ahora?')) return;
    setFallo(null);
    try { await post('/api/actualizacion/ahora'); recargar(); } catch (e) { setFallo(e); }
  };
  return (
    <Tarjeta titulo="Versión" icono={RefreshCw}>
      <dl className="divide-y divide-borde">
        <Fila etiqueta="Esta versión">{version ? <span className="font-mono">{version.slice(0, 7)}</span> : <span className="text-apagado">desarrollo (sin imagen publicada)</span>}</Fila>
        <Fila etiqueta="Actualización">
          {!datos ? <Cargando /> : datos.solicitada ? 'Pedida: se reinicia en unos minutos.'
            : datos.disponible ? <span className="flex flex-wrap items-center gap-2">Hay una versión nueva <Boton tam="sm" variante="primario" onClick={pedir}><Download className="size-3.5" /> Actualizar ahora</Boton></span>
              : 'Al día. Las nuevas se instalan solas cuando no hay sesiones abiertas.'}
        </Fila>
      </dl>
      <Fallo error={fallo} className="mt-2" />
    </Tarjeta>
  );
}

function Passkeys({ intentar }) {
  const { datos, recargar } = useDatos('/api/seguridad');
  const [alta, setAlta] = useState(null);
  if (!datos) return null; // sin Tailscale (404) no hay passkeys
  const sacarAlta = () => intentar(async () => setAlta(await post('/api/seguridad/alta')));
  const borrar = (id) => intentar(async () => { await post('/api/seguridad/borrar', { id }); recargar(); });
  const salir = async () => { await post('/api/seguridad/salir'); window.location.assign('/entrar'); };
  return (
    <Tarjeta titulo="Passkeys" icono={KeyRound} cuerpo="p-3" accion={datos.remota && <Boton tam="sm" variante="fantasma" onClick={salir}><LogOut className="size-3.5" /> Salir</Boton>}>
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

export default function Ajustes() {
  const { datos, error, cargando } = useDatos('/api/ajustes');
  const [fallo, setFallo] = useState(null);
  const { intentar, aviso } = usePasskey(setFallo);
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
    const mcp = datos?.mcp;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <Cabecera titulo="Ajustes" subtitulo="Cómo está montado Nullraptor en este equipo" />
        {aviso}
        <Fallo error={fallo ?? error} className="mb-4" />
        {datos && (
          <div className="space-y-6">
            <Actualizacion version={datos.version} />

            <AjustesEquipo />
            <Passkeys intentar={intentar} />

            <Tarjeta titulo="Datos" icono={FolderTree}>
              <dl className="divide-y divide-borde">
                <Fila etiqueta="Trabajo"><span className="font-mono text-[12px]">{datos.carpetas.trabajo}</span></Fila>
                <Fila etiqueta="Bóveda">{datos.carpetas.boveda ? <span className="font-mono text-[12px]">{datos.carpetas.boveda}</span> : <span className="text-apagado">sin bóveda</span>}</Fila>
                <Fila etiqueta={<span className="flex items-center gap-1.5"><GitBranch className="size-3.5" /> GitHub</span>}>{datos.github ? 'Token en el cofre: se pueden crear proyectos.' : 'Sin GITHUB_TOKEN en el cofre.'}</Fila>
              </dl>
            </Tarjeta>

            <Tarjeta titulo="Servidores MCP" icono={Plug}>
              {!mcp ? <p className="text-[13px] text-apagado">Sin bóveda: no hay estado de MCP.</p> : (
                <>
                  <p className="mb-2 text-[12px] text-apagado">Instalados (con tu autorización, desde el menú de la terminal, «m» o «b»):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mcp.instalados.length ? mcp.instalados.map((id) => <Insignia key={id} tono="ok">{id}</Insignia>) : <span className="text-[13px] text-apagado">Ninguno.</span>}
                  </div>
                  {mcp.hoy?.length > 0 && (
                    <>
                      <p className="mt-4 mb-2 text-[12px] text-apagado">Recomendados el {mcp.ultimaExploracion}:</p>
                      <ul className="space-y-2">
                        {mcp.hoy.map((s) => (
                          <li key={s.id} className="rounded-xl border border-borde bg-elevado/40 p-3">
                            <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-white">{s.titulo}{s.categoria && <Insignia tono={s.categoria === 'útil' ? 'raptor' : 'neutro'}>{s.categoria}</Insignia>}{mcp.instalados.includes(s.id) && <Insignia tono="ok">instalado</Insignia>}</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-tenue">{s.porque ?? s.descripcion}</p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="mt-3 text-[12px] text-apagado">Las herramientas propias se aprueban en <a href="#/herramientas" className="text-raptor hover:underline">Herramientas</a>.</p>
                </>
              )}
            </Tarjeta>
          </div>
        )}
      </div>
    </div>
  );
}
