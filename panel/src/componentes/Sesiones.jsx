// Sesiones de Claude Code en un proyecto (Remote Control): QR, tarjeta con su estado y la terminal a pantalla completa.
// Se usan desde Proyectos (abrir y ver la de cada proyecto) y Resumen (las abiertas).
import { ArrowLeft, ExternalLink, SquareTerminal, X } from 'lucide-react';
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import { duracion, enlace, useDatos } from '../api.js';
import Terminal from './Terminal.jsx';
import { Boton, Cargando, Insignia, Punto } from './ui.jsx';

export const ESTADO_SESION = {
  conectando: { tono: 'aviso', punto: 'aviso', texto: 'conectando' },
  conectada: { tono: 'ok', punto: 'ok', texto: 'conectada' },
  terminada: { tono: 'neutro', punto: 'apagado', texto: 'terminada' },
};

/** Ruta de la terminal de una sesión, dentro de su proyecto. */
export const enlaceTerminal = (s) => enlace('proyectos', `${s.proyecto}/terminal/${s.id}`);

export function Qr({ texto, className = 'size-40' }) {
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

/** Tarjeta de una sesión: QR para abrirla en el móvil, enlace a claude.ai, ver terminal y cerrar. */
export function TarjetaSesion({ s, alCerrar, conProyecto = false }) {
  const e = ESTADO_SESION[s.estado] ?? ESTADO_SESION.terminada;
  const viva = s.estado !== 'terminada';
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-borde bg-elevado/40 p-4 sm:flex-row">
      {s.url && viva ? <Qr texto={s.url} className="size-32" /> : (
        <div className="flex size-32 shrink-0 items-center justify-center rounded-lg border border-dashed border-borde-fuerte text-[12px] text-apagado">
          {viva ? <Cargando texto="Esperando URL…" /> : 'Sin sesión'}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Punto tono={e.punto} vivo={s.estado === 'conectando'} />
          <p className="min-w-0 flex-1 truncate font-medium text-white">{conProyecto ? s.proyecto : 'Sesión de Claude Code'}</p>
          <Insignia tono={e.tono}>{e.texto}</Insignia>
        </div>
        <p className="text-[12px] text-apagado">
          {viva ? `Abierta hace ${duracion(Date.now() - Date.parse(s.inicio))} · ${s.quien}` : (s.motivo ?? 'Terminada.')}
        </p>
        {s.url && viva && (
          <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] break-all text-raptor hover:underline">
            <ExternalLink className="size-3.5 shrink-0" /> Abrir en claude.ai o en la app
          </a>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {viva && <a href={enlaceTerminal(s)}><Boton tam="sm" variante="primario"><SquareTerminal className="size-3.5" /> Ver terminal</Boton></a>}
          <Boton variante={viva ? 'peligro' : 'fantasma'} tam="sm" onClick={() => alCerrar(s.id)}><X className="size-3.5" /> {viva ? 'Cerrar' : 'Quitar'}</Boton>
        </div>
      </div>
    </div>
  );
}

/** Terminal de una sesión a pantalla completa, con vuelta a su proyecto. */
export function VistaTerminal({ proyecto, id }) {
  const { datos } = useDatos('/api/remoto', { cada: 3000 });
  const s = datos?.sesiones.find((x) => x.id === id);
  return (
    <div className="flex h-full flex-col gap-3 p-3 md:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <a href={enlace('proyectos', proyecto)} className="flex items-center gap-1.5 text-[13px] text-apagado hover:text-raptor"><ArrowLeft className="size-4" /> {proyecto}</a>
        <p className="min-w-0 flex-1 truncate text-[13px] text-tenue">{s ? `Claude Code · ${ESTADO_SESION[s.estado]?.texto ?? s.estado}` : ''}</p>
        {s?.url && <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] text-raptor hover:underline"><ExternalLink className="size-3.5" /> claude.ai</a>}
      </div>
      <Terminal id={id} className="flex-1" />
    </div>
  );
}
