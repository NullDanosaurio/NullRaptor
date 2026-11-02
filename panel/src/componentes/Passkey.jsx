// Acciones que, por Tailscale, piden confirmar la passkey (terminal, seguridad, aprobar herramientas).
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { confirmarPasskey } from '../api.js';
import { Boton } from './ui.jsx';

/** Pide la passkey con un toque (Safari no la deja pedir sin él) y repite la acción. */
export function usePasskey(setFallo) {
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
