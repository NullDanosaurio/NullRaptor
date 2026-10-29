// Estructura del panel: barra lateral (abajo en el móvil) y la vista elegida por la ruta.
import { BookOpen, FolderKanban, LayoutDashboard, MessagesSquare, MonitorSmartphone } from 'lucide-react';
import { useDatos, useRuta } from './api.js';
import { cx, Punto } from './componentes/ui.jsx';
import Boveda from './vistas/Boveda.jsx';
import Chat from './vistas/Chat.jsx';
import Inicio from './vistas/Inicio.jsx';
import Remoto from './vistas/Remoto.jsx';
import Trabajo from './vistas/Trabajo.jsx';

const VISTAS = [
  { id: 'inicio', nombre: 'Inicio', icono: LayoutDashboard, componente: Inicio },
  { id: 'chat', nombre: 'Chat', icono: MessagesSquare, componente: Chat },
  { id: 'trabajo', nombre: 'Trabajo', icono: FolderKanban, componente: Trabajo },
  { id: 'boveda', nombre: 'Bóveda', icono: BookOpen, componente: Boveda },
  { id: 'remoto', nombre: 'Remoto', icono: MonitorSmartphone, componente: Remoto },
];

function Logo() {
  return (
    <a href="#/inicio" className="flex items-center gap-2.5 px-2" aria-label="Nullraptor, inicio">
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

export default function App() {
  const { vista, resto } = useRuta();
  const actual = VISTAS.find((v) => v.id === vista) ?? VISTAS[0];
  const Vista = actual.componente;

  return (
    <div className="flex h-full flex-col md:flex-row">
      <nav aria-label="Secciones" className="order-last flex shrink-0 items-center gap-1 border-t border-borde bg-panel/95 px-2 pt-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur md:order-first md:h-full md:w-[72px] md:flex-col md:items-stretch md:gap-1.5 md:border-t-0 md:border-r md:px-3 md:py-4 lg:w-60">
        <div className="hidden pb-5 md:block"><Logo /></div>
        {VISTAS.map(({ id, nombre, icono: Icono }) => {
          const activa = id === actual.id;
          return (
            <a
              key={id}
              href={`#/${id}`}
              aria-current={activa ? 'page' : undefined}
              className={cx(
                'group relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] transition-colors md:flex-none md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-[13px]',
                activa ? 'bg-elevado text-white' : 'text-apagado hover:bg-elevado/60 hover:text-texto',
              )}
            >
              {activa && <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 hidden w-[3px] rounded-r-full bg-raptor md:block" />}
              <Icono className={cx('size-[18px] shrink-0', activa && 'text-raptor')} strokeWidth={1.8} />
              <span className="md:hidden lg:inline">{nombre}</span>
            </a>
          );
        })}
        <div className="mt-auto hidden md:block"><EstadoBoveda /></div>
      </nav>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Vista key={actual.id} resto={resto} />
      </main>
    </div>
  );
}
