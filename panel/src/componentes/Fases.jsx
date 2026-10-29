// Fases de un intento del flujo como línea de tiempo (estilo «Agent Activity» de 21st.dev).
import { Check, Circle, Loader2, X } from 'lucide-react';
import { cx } from './ui.jsx';

export const NOMBRE_FASE = {
  implementador: 'Implementación (Codex)', typecheck: 'Typecheck', pruebas: 'Pruebas unitarias', build: 'Build', e2e: 'Pruebas E2E', revision: 'Revisión (Claude)',
};

function Icono({ estado, activa }) {
  if (estado === 'ok') return <span className="flex size-5 items-center justify-center rounded-full bg-ok/15 text-ok"><Check className="size-3" strokeWidth={3} /></span>;
  if (estado === 'fallo') return <span className="flex size-5 items-center justify-center rounded-full bg-fallo/15 text-fallo"><X className="size-3" strokeWidth={3} /></span>;
  if (activa) return <span className="flex size-5 items-center justify-center rounded-full bg-raptor/15 text-raptor"><Loader2 className="size-3 animate-spin" strokeWidth={2.5} /></span>;
  return <span className="flex size-5 items-center justify-center text-borde-fuerte"><Circle className="size-2.5" strokeWidth={3} /></span>;
}

/** Línea vertical con cada fase; la activa con brillo. `enCurso` indica si la ejecución sigue viva. */
export function LineaFases({ fases, actual, enCurso }) {
  return (
    <ol className="relative space-y-0.5">
      {fases.map((f, i) => {
        const activa = enCurso && f.fase === actual;
        return (
          <li key={f.fase} className="relative flex items-center gap-3 py-1.5">
            {i < fases.length - 1 && <span aria-hidden="true" className={cx('absolute top-7 left-[9.5px] h-[calc(100%-14px)] w-px', f.estado === 'ok' ? 'bg-ok/30' : 'bg-borde')} />}
            <Icono estado={f.estado} activa={activa} />
            <span className={cx('text-[13px]', activa ? 'brillo font-medium' : f.estado === 'pendiente' ? 'text-apagado' : f.estado === 'fallo' ? 'text-fallo' : 'text-texto')}>
              {NOMBRE_FASE[f.fase] ?? f.fase}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Barra horizontal compacta: un segmento por fase. */
export function BarraFases({ fases, actual, enCurso }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`Fases: ${fases.map((f) => `${NOMBRE_FASE[f.fase]} ${f.estado}`).join(', ')}`}>
      {fases.map((f) => (
        <span
          key={f.fase}
          title={NOMBRE_FASE[f.fase]}
          className={cx('h-1.5 flex-1 rounded-full', f.estado === 'ok' ? 'bg-ok/70' : f.estado === 'fallo' ? 'bg-fallo/80' : enCurso && f.fase === actual ? 'bg-raptor animate-latido' : 'bg-borde')}
        />
      ))}
    </div>
  );
}
