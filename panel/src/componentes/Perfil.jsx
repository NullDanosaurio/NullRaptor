// Perfil de la IA al abrir una sesión o un chat: Normal o Director IA (coordina al equipo de subagentes; ver
// config/perfiles). La última elección se recuerda por proyecto en este navegador (localStorage), nada en el servidor.
import { UserRound, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { cx } from './ui.jsx';

export const PERFILES = [
  { id: null, nombre: 'Normal', icono: UserRound },
  { id: 'director', nombre: 'Director IA', icono: UsersRound },
];
const clave = (proyecto) => `perfil.${proyecto}`;

export function perfilGuardado(proyecto) {
  try { const v = localStorage.getItem(clave(proyecto)); return PERFILES.some((p) => p.id === v) ? v : null; } catch { return null; }
}
export function guardarPerfil(proyecto, perfil) {
  try { if (perfil) localStorage.setItem(clave(proyecto), perfil); else localStorage.removeItem(clave(proyecto)); } catch { /* sin almacenamiento */ }
}

/** Perfil de un proyecto, recordado: [perfil, cambiar]. */
export function usePerfil(proyecto) {
  const [perfil, setPerfil] = useState(() => perfilGuardado(proyecto));
  const cambiar = (p) => { setPerfil(p); guardarPerfil(proyecto, p); };
  return [perfil, cambiar];
}

export const nombrePerfil = (id) => PERFILES.find((p) => p.id === id)?.nombre ?? 'Normal';

/** Dos botones grandes (44 px, cómodos en el móvil). `nota`: aviso debajo (p. ej. con Codex no hay perfil). */
export function SelectorPerfil({ valor, alCambiar, deshabilitado = false, nota = null, className }) {
  return (
    <div className={className}>
      <div role="radiogroup" aria-label="Perfil" className="grid grid-cols-2 gap-1 rounded-xl border border-borde bg-elevado/40 p-1">
        {PERFILES.map(({ id, nombre, icono: Icono }) => {
          const activo = !deshabilitado && valor === id;
          return (
            <button key={nombre} type="button" role="radio" aria-checked={activo} disabled={deshabilitado} onClick={() => alCambiar(id)}
              className={cx('flex h-11 items-center justify-center gap-2 rounded-lg text-[14px] disabled:opacity-40', activo ? 'bg-elevado text-white' : 'text-tenue hover:text-texto')}>
              <Icono className={cx('size-4', activo && id && 'text-raptor')} /> {nombre}
            </button>
          );
        })}
      </div>
      {nota && <p className="mt-1.5 text-[12px] text-apagado">{nota}</p>}
    </div>
  );
}
