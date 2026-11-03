// Botón «Copiar»: copia el texto (portapapeles.js) y dice «Copiado» o «No se pudo copiar» durante 1,5 s.
// `texto` puede ser una función, para leerlo justo al pulsar. La copia ocurre dentro del clic (sin esperas antes),
// que es lo que exige la copia de reserva sin navigator.clipboard.
import { Check, Copy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { alPortapapeles } from '../portapapeles.js';
import { cx } from './ui.jsx';

export default function Copiar({ texto, className, etiqueta = 'Copiar', titulo = 'Copiar al portapapeles' }) {
  const [estado, setEstado] = useState(null); // null · 'ok' · 'mal'
  const reloj = useRef(null);
  useEffect(() => () => clearTimeout(reloj.current), []);

  const copiar = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await alPortapapeles(typeof texto === 'function' ? texto() : texto);
    setEstado(ok ? 'ok' : 'mal');
    clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setEstado(null), 1500);
  };

  const Icono = estado === 'ok' ? Check : estado === 'mal' ? X : Copy;
  return (
    <button type="button" onClick={copiar} title={titulo}
      className={cx('inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 transition-colors',
        estado === 'ok' ? 'text-raptor' : estado === 'mal' ? 'text-fallo' : 'text-apagado hover:bg-elevado hover:text-texto', className)}>
      <Icono className="size-3.5" strokeWidth={2} aria-hidden="true" />
      <span aria-live="polite">{estado === 'ok' ? 'Copiado' : estado === 'mal' ? 'No se pudo copiar' : etiqueta}</span>
    </button>
  );
}
