// Herramientas: las de la imagen (Ruflo) y las propias de $TRABAJO_DIR/herramientas, que crea la IA.
// #/herramientas lista; #/herramientas/<id> enseña sus archivos para revisarla y aprobarla (o desactivarla).
// Se aprueba la huella de lo que se ha revisado: si cambia entretanto, el panel lo rechaza y hay que volver a mirarla.
import { ArrowLeft, FileCode, Power, ShieldCheck, Wrench } from 'lucide-react';
import { useState } from 'react';
import { enlace, haceCuanto, post, useDatos } from '../api.js';
import { usePasskey } from '../componentes/Passkey.jsx';
import { Boton, Cabecera, Cargando, Fallo, Insignia, Tarjeta, Vacio } from '../componentes/ui.jsx';

const ESTADO = {
  activa: { tono: 'ok', texto: 'activa', ayuda: 'Viene con la imagen: siempre disponible.' },
  aprobada: { tono: 'ok', texto: 'aprobada', ayuda: 'Llega a las sesiones que abras a partir de ahora.' },
  propuesta: { tono: 'aviso', texto: 'propuesta', ayuda: 'Nueva: revísala y apruébala para usarla.' },
  cambiada: { tono: 'aviso', texto: 'cambiada', ayuda: 'Ha cambiado desde que la aprobaste: está parada hasta que la revises otra vez.' },
  'no válida': { tono: 'fallo', texto: 'no válida', ayuda: 'Su ficha tiene un error.' },
};

const tamano = (b) => (b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`);

function Fila({ h }) {
  const e = ESTADO[h.estado] ?? ESTADO['no válida'];
  const contenido = (
    <>
      <span className="rounded-xl border border-borde bg-elevado p-2"><Wrench className="size-4 text-apagado" strokeWidth={1.8} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-white">{h.nombre}</p>
          <span className="font-mono text-[11px] text-apagado">{h.id}</span>
          {h.origen === 'imagen' && <Insignia>de la imagen</Insignia>}
        </div>
        <p className="mt-0.5 text-[13px] text-tenue">{h.error ?? (h.descripcion || 'Sin descripción.')}</p>
        <p className="mt-1 text-[12px] text-apagado">{e.ayuda}{h.aprobada && ` Aprobada ${haceCuanto(h.aprobada)}.`}</p>
      </div>
      <Insignia tono={e.tono}>{e.texto}</Insignia>
    </>
  );
  if (h.origen === 'imagen') return <li className="flex items-start gap-3 px-4 py-3">{contenido}</li>;
  return (
    <li>
      <a href={enlace('herramientas', h.id)} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-elevado/50">{contenido}</a>
    </li>
  );
}

function Lista() {
  const { datos, error, cargando } = useDatos('/api/herramientas', { cada: 15_000 });
  const propias = datos?.herramientas.filter((h) => h.origen === 'propia') ?? [];
  const pendientes = propias.filter((h) => h.estado === 'propuesta' || h.estado === 'cambiada').length;
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <Cabecera titulo="Herramientas" subtitulo={pendientes ? `${pendientes} por revisar` : 'Lo que la IA puede usar en tus sesiones'} />
      <Fallo error={error} className="mb-4" />
      {cargando && !datos && <Cargando />}
      {datos && (
        <Tarjeta cuerpo="p-0">
          <ul className="divide-y divide-borde">{datos.herramientas.map((h) => <Fila key={h.id} h={h} />)}</ul>
          {!propias.length && (
            <Vacio icono={Wrench} titulo="Aún no hay herramientas propias">
              Pídele a Claude, en cualquier sesión, que te cree una («hazme una herramienta que…»). Aparecerá aquí como
              propuesta para que la revises y la apruebes.
            </Vacio>
          )}
        </Tarjeta>
      )}
    </div>
  );
}

function Archivo({ id, ruta }) {
  const { datos, error, cargando } = useDatos(`/api/herramientas/archivo?id=${encodeURIComponent(id)}&ruta=${encodeURIComponent(ruta)}`);
  if (cargando && !datos) return <Cargando className="p-4" />;
  if (error) return <Fallo error={error} className="m-4" />;
  if (datos.binario) return <p className="p-4 text-[13px] text-apagado">Archivo binario ({tamano(datos.bytes)}): no se muestra.</p>;
  return (
    <>
      <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed whitespace-pre text-texto">{datos.texto}</pre>
      {datos.cortado && <p className="border-t border-borde px-4 py-2 text-[12px] text-aviso">Solo se muestran los primeros 200 KB.</p>}
    </>
  );
}

function Detalle({ id }) {
  const lista = useDatos('/api/herramientas');
  const archivos = useDatos(`/api/herramientas/archivos?id=${encodeURIComponent(id)}`);
  const [abierto, setAbierto] = useState('herramienta.json');
  const [fallo, setFallo] = useState(null);
  const [hecho, setHecho] = useState(null);
  const { intentar, aviso } = usePasskey(setFallo);
  const h = lista.datos?.herramientas.find((x) => x.id === id);
  const recargar = () => { lista.recargar(); archivos.recargar(); };

  const aprobar = () => intentar(async () => {
    try { await post('/api/herramientas/aprobar', { id, huella: h.huella }); } catch (e) {
      if (e.estado === 409) recargar(); // ha cambiado: se enseña lo nuevo
      throw e;
    }
    setHecho('Aprobada: estará en las sesiones que abras desde ahora.');
    recargar();
  });
  const desactivar = () => intentar(async () => { await post('/api/herramientas/desactivar', { id }); setHecho('Desactivada.'); recargar(); });

  if (lista.cargando && !lista.datos) return <Cargando className="p-8" />;
  const atras = <a href={enlace('herramientas')} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-apagado hover:text-texto"><ArrowLeft className="size-3.5" /> Herramientas</a>;
  if (!h || h.origen !== 'propia') return <div className="mx-auto max-w-3xl p-4 md:p-8">{atras}<Vacio icono={Wrench} titulo="Esa herramienta no existe" /></div>;
  const e = ESTADO[h.estado] ?? ESTADO['no válida'];
  const puedeAprobar = (h.estado === 'propuesta' || h.estado === 'cambiada') && h.huella && lista.datos.aprobar;

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-8">
      {atras}
      <Cabecera titulo={h.nombre} subtitulo={h.error ?? h.descripcion}>
        <Insignia tono={e.tono}>{e.texto}</Insignia>
      </Cabecera>
      {aviso}
      <Fallo error={fallo || lista.error} className="mb-4" />
      {hecho && <p className="mb-4 rounded-xl border border-ok/25 bg-ok/10 px-3 py-2 text-[13px] text-ok">{hecho}</p>}

      <Tarjeta titulo="Antes de aprobar" icono={ShieldCheck} className="mb-4">
        <p className="text-[13px] text-tenue">
          Una herramienta aprobada corre dentro del contenedor con sus mismos permisos: puede leer y cambiar tus proyectos y
          usar la red. Revisa sus archivos. Si después cambia cualquiera de ellos, se para sola hasta que la apruebes otra vez.
        </p>
        {h.mcp?.variables?.length > 0 && (
          <p className="mt-2 text-[13px] text-tenue">
            Variables del cofre que recibe: {h.mcp.variables.map((v) => <code key={v.nombre} className="mx-0.5 font-mono text-[12px] text-texto">{v.nombre}{v.obligatoria ? '*' : ''}</code>)}
          </p>
        )}
        {h.huella && <p className="mt-2 font-mono text-[11px] break-all text-apagado">huella {h.huella}</p>}
        {h.motivo && <p className="mt-2 text-[13px] text-fallo">{h.motivo}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {puedeAprobar && <Boton variante="primario" onClick={aprobar}><ShieldCheck className="size-4" /> {h.estado === 'cambiada' ? 'Aprobar los cambios' : 'Aprobar'}</Boton>}
          {(h.estado === 'aprobada' || h.estado === 'cambiada') && <Boton variante="peligro" onClick={desactivar}><Power className="size-4" /> Desactivar</Boton>}
          {!lista.datos.aprobar && <p className="text-[12px] text-apagado">Desde la red de casa solo con el código no se aprueba: hazlo desde este equipo o por Tailscale.</p>}
        </div>
      </Tarjeta>

      <Tarjeta titulo="Archivos" icono={FileCode} cuerpo="p-0">
        <Fallo error={archivos.error} className="m-4" />
        {archivos.datos && (
          <div className="flex flex-col md:flex-row">
            <ul className="max-h-48 shrink-0 overflow-auto border-b border-borde py-1 md:max-h-[60vh] md:w-60 md:border-r md:border-b-0">
              {archivos.datos.archivos.map((a) => (
                <li key={a.ruta}>
                  <button
                    type="button"
                    disabled={Boolean(a.enlace)}
                    onClick={() => setAbierto(a.ruta)}
                    className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-[12px] ${abierto === a.ruta ? 'bg-elevado text-white' : 'text-tenue hover:bg-elevado/50'}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono">{a.ruta}</span>
                    <span className="shrink-0 text-[11px] text-apagado">{a.enlace ? `→ ${a.enlace}` : tamano(a.bytes)}</span>
                  </button>
                </li>
              ))}
              {archivos.datos.cortada && <li className="px-3 py-1.5 text-[11px] text-aviso">Hay más archivos de los que se listan.</li>}
            </ul>
            <div className="min-w-0 flex-1">{abierto && <Archivo key={`${abierto}-${h.huella}`} id={id} ruta={abierto} />}</div>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}

export default function Herramientas({ resto }) {
  return <div className="h-full overflow-y-auto">{resto ? <Detalle id={resto} /> : <Lista />}</div>;
}
