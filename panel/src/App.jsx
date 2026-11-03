// Estructura del panel: barra lateral en el escritorio (todas las vistas) y barra de abajo en el móvil, pensada para el
// pulgar: Inicio · Proyectos · Jarvis (voz, en el centro) · Bóveda · Más (Chat, Herramientas y Ajustes en una hoja).
import { AudioLines, BookOpen, Ellipsis, FolderKanban, LayoutDashboard, MessagesSquare, Settings, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useDatos, useRuta } from './api.js';
import AvisoActualizacion from './componentes/AvisoActualizacion.jsx';
import { cx, Punto } from './componentes/ui.jsx';
import Ajustes from './vistas/Ajustes.jsx';
import Boveda from './vistas/Boveda.jsx';
import Chat from './vistas/Chat.jsx';
import Herramientas from './vistas/Herramientas.jsx';
import Jarvis from './vistas/Jarvis.jsx';
import Proyectos from './vistas/Proyectos.jsx';
import Resumen from './vistas/Resumen.jsx';

// `movil`: en la barra de abajo; si no, va en «Más».
const VISTAS = [
  { id: 'resumen', nombre: 'Resumen', corto: 'Inicio', icono: LayoutDashboard, componente: Resumen, movil: true },
  { id: 'proyectos', nombre: 'Proyectos', icono: FolderKanban, componente: Proyectos, movil: true },
  { id: 'jarvis', nombre: 'Jarvis', icono: AudioLines, componente: Jarvis, movil: true },
  { id: 'boveda', nombre: 'Bóveda', icono: BookOpen, componente: Boveda, movil: true },
  { id: 'chat', nombre: 'Chat', icono: MessagesSquare, componente: Chat },
  { id: 'herramientas', nombre: 'Herramientas', icono: Wrench, componente: Herramientas },
  { id: 'ajustes', nombre: 'Ajustes', icono: Settings, componente: Ajustes },
];
const EN_MAS = VISTAS.filter((v) => !v.movil);

// Rutas de antes de la fase 4 (enlaces guardados, marcadores): a su sitio nuevo.
const ANTIGUAS = { inicio: 'resumen', trabajo: 'proyectos', remoto: 'proyectos' };

function Logo() {
  return (
    <a href="#/resumen" className="flex items-center gap-2.5 px-2" aria-label="Nullraptor, inicio">
      <img src="/raptor.svg" alt="" className="size-8 rounded-lg ring-1 ring-raptor/30" />
      <span className="hidden flex-col leading-tight lg:flex">
        <span className="text-[15px] font-semibold tracking-tight text-white">Nullraptor</span>
        <span className="text-[11px] text-apagado">caza en manada</span>
      </span>
    </a>
  );
}

function EstadoBoveda() {
  const { datos } = useDatos('/api/resumen', { cada: 30_000 });
  const git = datos?.boveda?.git;
  if (!datos) return null;
  if (!git) return <p className="hidden px-3 text-[11px] text-apagado lg:block">Sin bóveda</p>;
  const sincronizada = !git.delante && !git.detras && !git.sucios;
  return (
    <div className="hidden rounded-xl border border-borde bg-elevado/60 px-3 py-2.5 lg:block">
      <div className="flex items-center gap-2 text-[12px] text-tenue">
        <Punto tono={sincronizada ? 'ok' : 'aviso'} /> Bóveda · <span className="font-mono text-[11px]">{git.rama}</span>
      </div>
      <p className="mt-1 text-[11px] text-apagado">
        {sincronizada ? 'Al día con GitHub' : [git.delante && `${git.delante} sin subir`, git.detras && `${git.detras} por bajar`, git.sucios && `${git.sucios} cambios locales`].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}

/** Enlace de la barra lateral (escritorio). */
function EnlaceLateral({ v, activa }) {
  const Icono = v.icono;
  return (
    <a href={`#/${v.id}`} aria-current={activa ? 'page' : undefined}
      className={cx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors', activa ? 'bg-elevado text-white' : 'text-apagado hover:bg-elevado/60 hover:text-texto')}>
      {activa && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-raptor" />}
      <Icono className={cx('size-[18px] shrink-0', activa && 'text-raptor')} strokeWidth={1.8} />
      <span className="hidden truncate lg:inline">{v.nombre}</span>
    </a>
  );
}

/** Barra de abajo (móvil): botones de al menos 56 px de alto; Jarvis, grande y en el centro. */
function BarraMovil({ marcada, abrirMas }) {
  const enMas = EN_MAS.some((v) => v.id === marcada);
  const boton = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-colors';
  return (
    <nav aria-label="Secciones" className="flex shrink-0 items-stretch gap-1 border-t border-borde bg-panel/95 px-2 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
      {VISTAS.filter((v) => v.movil).map((v) => {
        const activa = v.id === marcada;
        const Icono = v.icono;
        if (v.id === 'jarvis') {
          return (
            <a key={v.id} href="#/jarvis" aria-current={activa ? 'page' : undefined} aria-label="Jarvis (voz)" className="flex flex-1 flex-col items-center justify-end gap-1 text-[11px]">
              <span className={cx('-mt-6 flex size-14 items-center justify-center rounded-full border-4 border-fondo shadow-[0_6px_20px_rgb(0_0_0/0.5)] transition-colors', activa ? 'bg-raptor text-fondo' : 'bg-raptor/90 text-fondo')}>
                <Icono className="size-6" strokeWidth={2.2} />
              </span>
              <span className={activa ? 'text-white' : 'text-apagado'}>Jarvis</span>
            </a>
          );
        }
        return (
          <a key={v.id} href={`#/${v.id}`} aria-current={activa ? 'page' : undefined} className={cx(boton, activa ? 'text-white' : 'text-apagado active:bg-elevado')}>
            <Icono className={cx('size-[22px]', activa && 'text-raptor')} strokeWidth={1.8} />
            {v.corto ?? v.nombre}
          </a>
        );
      })}
      <button type="button" onClick={abrirMas} aria-haspopup="dialog" className={cx(boton, enMas ? 'text-white' : 'text-apagado active:bg-elevado')}>
        <Ellipsis className={cx('size-[22px]', enMas && 'text-raptor')} strokeWidth={1.8} />
        Más
      </button>
    </nav>
  );
}

/** Hoja de «Más» (móvil): Chat, Herramientas y Ajustes, con botones grandes. */
function HojaMas({ abierta, cerrar, marcada }) {
  useEffect(() => {
    if (!abierta) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [abierta, cerrar]);
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Más secciones">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={cerrar} />
      <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-borde bg-panel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] animate-entrar">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-borde-fuerte" />
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[15px] font-semibold text-white">Más</p>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="flex size-11 items-center justify-center rounded-full text-apagado active:bg-elevado"><X className="size-5" /></button>
        </div>
        <ul className="grid gap-1.5">
          {EN_MAS.map((v) => {
            const Icono = v.icono;
            return (
              <li key={v.id}>
                <a href={`#/${v.id}`} onClick={cerrar} aria-current={v.id === marcada ? 'page' : undefined}
                  className={cx('flex min-h-14 items-center gap-4 rounded-2xl px-4 text-[16px]', v.id === marcada ? 'bg-elevado text-white' : 'text-texto active:bg-elevado')}>
                  <Icono className={cx('size-6', v.id === marcada ? 'text-raptor' : 'text-tenue')} strokeWidth={1.8} />
                  {v.nombre}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function App() {
  const { vista, resto } = useRuta();
  const [mas, setMas] = useState(false);
  useEffect(() => {
    if (ANTIGUAS[vista]) window.location.replace(`#/${ANTIGUAS[vista]}${vista === 'trabajo' && resto ? `/${encodeURIComponent(resto)}` : ''}`);
  }, [vista, resto]);
  useEffect(() => { setMas(false); }, [vista]);
  const actual = VISTAS.find((v) => v.id === vista) ?? VISTAS[0];
  const Vista = actual.componente;

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav aria-label="Secciones" className="hidden shrink-0 flex-col gap-1.5 border-r border-borde bg-panel/95 px-3 py-4 md:flex md:h-full md:w-[72px] lg:w-60">
        <div className="pb-5"><Logo /></div>
        {VISTAS.map((v) => <EnlaceLateral key={v.id} v={v} activa={v.id === actual.id} />)}
        <div className="mt-auto"><EstadoBoveda /></div>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AvisoActualizacion />
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0"><Vista key={actual.id} resto={resto} /></div>
        </div>
      </main>
      <BarraMovil marcada={actual.id} abrirMas={() => setMas(true)} />
      <HojaMas abierta={mas} cerrar={() => setMas(false)} marcada={actual.id} />
    </div>
  );
}
