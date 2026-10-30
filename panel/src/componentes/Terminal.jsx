// Terminal de una sesión remota (Claude Code en el contenedor) con xterm.js: la pantalla llega por SSE y las teclas
// salen por POST, en orden. Por Tailscale, si el servidor pide confirmar la passkey, se pide con un botón (Safari
// solo deja usar la passkey tras un toque). Copiar: Ctrl+C (o Cmd+C) con texto seleccionado copia en vez de interrumpir;
// Claude Code captura el ratón, así que se selecciona con Mayús+arrastrar. En el móvil, «Texto» muestra la pantalla
// como texto normal para seleccionarlo con el dedo.
import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Copy, FileText, KeyRound, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmarPasskey, post } from '../api.js';
import { Boton, cx } from './ui.jsx';

// Teclas que en el móvil no hay: Claude Code usa Esc, Tab, Mayús+Tab (modo de permisos), flechas y Ctrl+C.
const TECLAS = [['Esc', '\x1b'], ['Tab', '\t'], ['⇧Tab', '\x1b[Z'], ['↑', '\x1b[A'], ['↓', '\x1b[B'], ['Ctrl+C', '\x03'], ['Intro', '\r']];

// Texto de la terminal: la selección, o todo el búfer (sin líneas vacías al final).
function textoDe(term, soloSeleccion) {
  if (soloSeleccion) return term.getSelection();
  const b = term.buffer.active;
  const lineas = [];
  for (let i = 0; i < b.length; i++) lineas.push(b.getLine(i)?.translateToString(true) ?? '');
  while (lineas.length && !lineas.at(-1)) lineas.pop();
  return lineas.join('\n');
}

async function alPortapapeles(texto) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(texto);
  // Sin contexto seguro (http fuera de localhost) no hay API: se copia con un textarea temporal.
  const t = Object.assign(document.createElement('textarea'), { value: texto });
  document.body.append(t);
  t.select();
  document.execCommand('copy');
  t.remove();
}

export default function Terminal({ id, className }) {
  const caja = useRef(null);
  const xterm = useRef(null);
  const enviar = useRef(() => {});
  const [texto, setTexto] = useState(null); // vista de texto seleccionable (móvil)
  const [copiado, setCopiado] = useState(false);
  const [estado, setEstado] = useState('comprobando'); // comprobando | confirmar | viva | perdida | fin
  const [aviso, setAviso] = useState(null);
  const [intento, setIntento] = useState(0);

  const confirmar = useCallback(async () => {
    setAviso(null);
    try { await confirmarPasskey(); setIntento((n) => n + 1); } catch (e) { setAviso(e.name === 'NotAllowedError' ? 'Cancelado.' : e.message); }
  }, []);

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true, scrollback: 5000, fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: { background: '#0c0f0d', foreground: '#e6e8e3', cursor: '#b5f04a' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(caja.current);
    xterm.current = term;
    // Ctrl+C / Cmd+C con selección (o Ctrl+Mayús+C): copiar, sin mandar la interrupción a Claude.
    term.attachCustomKeyEventHandler((e) => {
      const teclaC = e.key.toLowerCase() === 'c' && (e.ctrlKey || e.metaKey);
      if (!teclaC || !(term.hasSelection() || e.shiftKey)) return true;
      e.preventDefault();
      if (e.type === 'keydown' && term.hasSelection()) alPortapapeles(term.getSelection()).then(() => term.clearSelection()).catch(() => {});
      return false;
    });
    try { fit.fit(); } catch { /* sin tamaño aún */ }
    let fuente = null;
    let vivo = true;

    // Entrada en orden: se agrupan las teclas mientras va la petición anterior.
    let pendiente = '';
    let enviando = false;
    const vaciar = async () => {
      if (enviando || !pendiente) return;
      enviando = true;
      const datos = pendiente;
      pendiente = '';
      try { await post(`/api/remoto/${id}/entrada`, { datos }); } catch (e) {
        if (e.reautenticar) setEstado('confirmar'); else setAviso(e.message);
      } finally { enviando = false; if (pendiente) vaciar(); }
    };
    enviar.current = (d) => { pendiente += d; vaciar(); term.focus(); };
    term.onData((d) => enviar.current(d));

    let reloj;
    const tamano = () => post(`/api/remoto/${id}/tamano`, { cols: term.cols, filas: term.rows });
    const ajustar = () => {
      clearTimeout(reloj);
      reloj = setTimeout(() => { try { fit.fit(); } catch { /* oculta */ } tamano().catch(() => {}); }, 150);
    };
    const observador = new ResizeObserver(ajustar);
    observador.observe(caja.current);

    // Primero el tamaño: comprueba también el permiso (y si hay que confirmar la passkey) antes de abrir el SSE.
    tamano().then(() => {
      if (!vivo) return;
      fuente = new EventSource(`/api/remoto/${id}/terminal`);
      fuente.addEventListener('pantalla', (e) => { term.reset(); term.write(JSON.parse(e.data)); setEstado('viva'); setAviso(null); term.focus(); });
      fuente.addEventListener('datos', (e) => term.write(JSON.parse(e.data)));
      fuente.addEventListener('fin', (e) => { setEstado('fin'); setAviso(JSON.parse(e.data)?.motivo ?? 'Sesión terminada.'); fuente.close(); });
      fuente.onerror = () => { if (fuente.readyState === EventSource.CLOSED) setEstado((s) => (s === 'fin' ? s : 'perdida')); };
    }).catch((e) => {
      if (!vivo) return;
      if (e.reautenticar) setEstado('confirmar');
      else if (e.estado === 404) { setEstado('fin'); setAviso(e.message); } else { setEstado('perdida'); setAviso(e.message); }
    });

    return () => { vivo = false; xterm.current = null; clearTimeout(reloj); observador.disconnect(); fuente?.close(); term.dispose(); };
  }, [id, intento]);

  // Copia la selección; sin selección, toda la pantalla.
  const copiar = useCallback(async (valor) => {
    const term = xterm.current;
    const t = valor ?? (term ? textoDe(term, term.hasSelection()) : '');
    if (!t) return;
    try { await alPortapapeles(t); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { setAviso('No se pudo copiar.'); }
  }, []);

  return (
    <div className={cx('flex min-h-0 flex-col gap-2', className)}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-borde bg-[#0c0f0d] p-2">
        <div ref={caja} className="h-full w-full" />
        {texto !== null && (
          <div className="absolute inset-0 z-10 flex flex-col gap-2 bg-[#0c0f0d] p-2">
            <div className="flex gap-1.5">
              <Boton tam="sm" onClick={() => copiar(texto)}><Copy className="size-3.5" /> {copiado ? 'Copiado' : 'Copiar todo'}</Boton>
              <Boton tam="sm" variante="fantasma" onClick={() => setTexto(null)} className="ml-auto"><X className="size-3.5" /> Volver</Boton>
            </div>
            <pre className="min-h-0 flex-1 select-text overflow-auto whitespace-pre-wrap break-all font-mono text-[12px] text-[#e6e8e3]">{texto}</pre>
          </div>
        )}
        {estado !== 'viva' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0f0d]/85 p-6 text-center text-[13px] text-tenue">
            {estado === 'comprobando' && <p>Conectando con la terminal…</p>}
            {estado === 'confirmar' && (<><p>Para usar la terminal desde fuera, confirma que eres tú.</p><Boton variante="primario" onClick={confirmar}><KeyRound className="size-4" /> Confirmar con passkey</Boton></>)}
            {estado === 'perdida' && (<><p>Se ha perdido la conexión con la terminal.</p><Boton onClick={() => setIntento((n) => n + 1)}><RotateCw className="size-4" /> Reconectar</Boton></>)}
            {estado === 'fin' && <p>La sesión ha terminado.</p>}
            {aviso && <p className="text-fallo">{aviso}</p>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TECLAS.map(([nombre, codigo]) => (
          <Boton key={nombre} tam="sm" disabled={estado !== 'viva'} onClick={() => enviar.current(codigo)} className="font-mono">{nombre}</Boton>
        ))}
        <Boton tam="sm" disabled={estado !== 'viva'} onClick={() => copiar()} className="ml-auto" title="Copia lo seleccionado o, sin selección, toda la pantalla">
          <Copy className="size-3.5" /> {copiado ? 'Copiado' : 'Copiar'}
        </Boton>
        <Boton tam="sm" disabled={estado !== 'viva'} onClick={() => xterm.current && setTexto(textoDe(xterm.current, false))} title="Ver como texto para seleccionarlo con el dedo">
          <FileText className="size-3.5" /> Texto
        </Boton>
      </div>
    </div>
  );
}
