// Piezas pequeñas compartidas: tarjetas, insignias, avatares, estados vacíos y de carga.
import { AlertTriangle, Loader2 } from 'lucide-react';

export const cx = (...c) => c.filter(Boolean).join(' ');

export function Tarjeta({ titulo, icono: Icono, accion, children, className, cuerpo = 'p-4' }) {
  return (
    <section className={cx('rounded-2xl border border-borde bg-panel/80 backdrop-blur-sm', className)}>
      {titulo && (
        <header className="flex items-center gap-2 border-b border-borde px-4 py-3">
          {Icono && <Icono className="size-4 text-apagado" strokeWidth={1.8} />}
          <h2 className="text-[13px] font-medium tracking-wide text-tenue">{titulo}</h2>
          {accion && <div className="ml-auto">{accion}</div>}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

const TONOS = {
  neutro: 'border-borde-fuerte bg-elevado text-tenue',
  raptor: 'border-raptor/25 bg-raptor/10 text-raptor',
  ok: 'border-ok/25 bg-ok/10 text-ok',
  aviso: 'border-aviso/25 bg-aviso/10 text-aviso',
  fallo: 'border-fallo/25 bg-fallo/10 text-fallo',
  claude: 'border-claude/25 bg-claude/10 text-claude',
  codex: 'border-codex/25 bg-codex/10 text-codex',
};

export function Insignia({ tono = 'neutro', children, className }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', TONOS[tono], className)}>{children}</span>;
}

export function Punto({ tono = 'ok', vivo = false }) {
  const color = { ok: 'bg-ok', aviso: 'bg-aviso', fallo: 'bg-fallo', apagado: 'bg-apagado', raptor: 'bg-raptor' }[tono];
  return (
    <span className="relative inline-flex size-2">
      {vivo && <span className={cx('absolute inset-0 rounded-full opacity-60 animate-ping', color)} />}
      <span className={cx('relative inline-flex size-2 rounded-full', color)} />
    </span>
  );
}

export const PERSONAS = {
  dano: { nombre: 'Dano', inicial: 'D', anillo: 'ring-borde-fuerte', fondo: 'bg-elevado text-texto', texto: 'text-texto' },
  claude: { nombre: 'Claude', inicial: 'C', anillo: 'ring-claude/40', fondo: 'bg-claude/15 text-claude', texto: 'text-claude' },
  codex: { nombre: 'Codex', inicial: 'X', anillo: 'ring-codex/40', fondo: 'bg-codex/15 text-codex', texto: 'text-codex' },
};

export function Avatar({ quien, className }) {
  const p = PERSONAS[quien] ?? PERSONAS.dano;
  return (
    <span aria-hidden="true" className={cx('inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ring-1', p.anillo, p.fondo, className)}>
      {p.inicial}
    </span>
  );
}

export function Cargando({ texto = 'Cargando…', className }) {
  return (
    <div className={cx('flex items-center gap-2 text-[13px] text-apagado', className)}>
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  );
}

export function Vacio({ icono: Icono, titulo, children, className }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      {Icono && <span className="mb-1 rounded-2xl border border-borde bg-elevado p-3"><Icono className="size-5 text-apagado" strokeWidth={1.6} /></span>}
      <p className="font-medium text-texto">{titulo}</p>
      {children && <div className="max-w-sm text-[13px] text-apagado">{children}</div>}
    </div>
  );
}

export function Fallo({ error, className }) {
  if (!error) return null;
  return (
    <div role="alert" className={cx('flex items-start gap-2 rounded-xl border border-fallo/25 bg-fallo/10 px-3 py-2 text-[13px] text-fallo', className)}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> <span>{error.message ?? String(error)}</span>
    </div>
  );
}

export function Boton({ variante = 'suave', tam = 'md', className, children, ...props }) {
  const v = {
    primario: 'bg-raptor text-fondo hover:bg-[#c4f75e] font-semibold',
    suave: 'border border-borde-fuerte bg-elevado text-texto hover:bg-borde',
    fantasma: 'text-tenue hover:bg-elevado hover:text-texto',
    peligro: 'border border-fallo/30 bg-fallo/10 text-fallo hover:bg-fallo/20',
  }[variante];
  const t = { sm: 'h-7 px-2.5 text-[12px] gap-1.5 rounded-lg', md: 'h-9 px-3.5 text-[13px] gap-2 rounded-xl', icono: 'size-8 rounded-lg justify-center' }[tam];
  return (
    <button
      type="button"
      className={cx('inline-flex items-center transition-[scale,background-color,color] duration-150 ease-salida active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40', v, t, className)}
      {...props}
    >
      {children}
    </button>
  );
}

/** Cabecera de una vista: título grande, subtítulo y acciones a la derecha. */
export function Cabecera({ titulo, subtitulo, children }) {
  return (
    <div className="flex flex-wrap items-end gap-3 pb-5">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-white">{titulo}</h1>
        {subtitulo && <p className="mt-0.5 text-[13px] text-apagado">{subtitulo}</p>}
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}
