// Caja de escritura bajo la terminal: lo que el teclado del móvil no puede hacer dentro de xterm. Se escribe, se pega
// o se dicta como en cualquier campo de texto, se adjuntan imágenes (galería, cámara o pegadas) y se manda todo de
// una vez a Claude Code como texto pegado. Las imágenes se suben al panel y Claude las recibe por su ruta.
import { ClipboardPaste, ImagePlus, Loader2, Mic, MicOff, SendHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Boton, cx } from './ui.jsx';

const Reconocimiento = typeof window !== 'undefined' ? (window.SpeechRecognition ?? window.webkitSpeechRecognition) : null;
const tactil = () => window.matchMedia?.('(pointer: coarse)').matches;
const LADO_MAX = 2000; // Claude reduce las imágenes grandes igualmente: así suben antes desde el móvil

/** Fotos grandes → JPEG de 2000 px como mucho; capturas pequeñas, tal cual. */
async function preparar(archivo) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(archivo.type) || archivo.type === 'image/gif') return archivo;
  try {
    const bmp = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    if (escala === 1 && archivo.size < 3 * 1024 * 1024) return archivo;
    const lienzo = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * escala), height: Math.round(bmp.height * escala) });
    lienzo.getContext('2d').drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((r) => lienzo.toBlob((b) => r(b ?? archivo), 'image/jpeg', 0.85));
  } catch { return archivo; }
}

export default function Redactor({ activo, enviar, subirImagen }) {
  const [texto, setTexto] = useState('');
  const [imagenes, setImagenes] = useState([]); // { clave, vista, ruta | null, error }
  const [dictando, setDictando] = useState(false);
  const [provisional, setProvisional] = useState('');
  const [aviso, setAviso] = useState(null);
  const campo = useRef(null);
  const selector = useRef(null);
  const oido = useRef(null);

  // Altura según el texto, hasta 6 líneas.
  useEffect(() => {
    const t = campo.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 140)}px`;
  }, [texto, provisional]);
  useEffect(() => () => { oido.current?.abort(); imagenes.forEach((i) => URL.revokeObjectURL(i.vista)); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const adjuntar = async (archivos) => {
    for (const archivo of archivos) {
      if (!archivo.type.startsWith('image/')) { setAviso('Solo imágenes.'); continue; }
      const clave = crypto.randomUUID();
      setImagenes((l) => [...l, { clave, vista: URL.createObjectURL(archivo), ruta: null, error: null }]);
      try {
        const ruta = await subirImagen(await preparar(archivo));
        setImagenes((l) => l.map((i) => (i.clave === clave ? { ...i, ruta } : i)));
      } catch (e) {
        setImagenes((l) => l.map((i) => (i.clave === clave ? { ...i, error: e.message } : i)));
      }
    }
  };
  const quitar = (clave) => setImagenes((l) => l.filter((i) => { if (i.clave === clave) URL.revokeObjectURL(i.vista); return i.clave !== clave; }));

  const pegar = async () => {
    setAviso(null);
    try {
      const elementos = await navigator.clipboard.read?.();
      const fotos = [];
      for (const el of elementos ?? []) {
        const tipo = el.types.find((t) => t.startsWith('image/'));
        if (tipo) fotos.push(new File([await el.getType(tipo)], 'pegada', { type: tipo }));
      }
      if (fotos.length) { await adjuntar(fotos); return; }
      const t = await navigator.clipboard.readText();
      if (t) setTexto((v) => v + t);
    } catch {
      setAviso('El navegador no deja leer el portapapeles: mantén pulsado en la caja y elige «Pegar».');
      campo.current?.focus();
    }
  };

  const alPegar = (e) => {
    const fotos = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!fotos.length) return;
    e.preventDefault();
    adjuntar(fotos);
  };

  const dictar = () => {
    if (dictando) { oido.current?.stop(); return; }
    const r = new Reconocimiento();
    Object.assign(r, { lang: 'es-ES', continuous: true, interimResults: true });
    r.onresult = (e) => {
      let fijo = '';
      let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fijo += e.results[i][0].transcript) : (tmp += e.results[i][0].transcript));
      if (fijo) setTexto((v) => `${v}${v && !/\s$/.test(v) ? ' ' : ''}${fijo.trim()}`);
      setProvisional(tmp);
    };
    r.onerror = (e) => setAviso(e.error === 'not-allowed' ? 'Permite el micrófono para dictar.' : `Dictado: ${e.error}`);
    r.onend = () => { setDictando(false); setProvisional(''); };
    oido.current = r;
    setAviso(null);
    r.start();
    setDictando(true);
  };

  const subiendo = imagenes.some((i) => !i.ruta && !i.error);
  const listas = imagenes.filter((i) => i.ruta);
  const puede = activo && !subiendo && (texto.trim() || listas.length);

  const mandar = () => {
    if (!puede) return;
    oido.current?.stop();
    const rutas = listas.map((i) => i.ruta);
    const mensaje = [texto.trim(), rutas.length ? `Imágenes adjuntas: ${rutas.join(' ')}` : ''].filter(Boolean).join('\n\n');
    // Como texto pegado (bracketed paste): los saltos de línea no envían por el camino; luego Intro.
    enviar(`\x1b[200~${mensaje}\x1b[201~`);
    setTimeout(() => enviar('\r'), 150);
    setTexto('');
    imagenes.forEach((i) => URL.revokeObjectURL(i.vista));
    setImagenes([]);
  };

  const tecla = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !tactil() && !e.nativeEvent.isComposing) { e.preventDefault(); mandar(); }
  };

  return (
    <div className="rounded-xl border border-borde bg-panel p-2">
      {imagenes.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {imagenes.map((i) => (
            <div key={i.clave} className="relative">
              <img src={i.vista} alt="" className={cx('size-14 rounded-lg border object-cover', i.error ? 'border-fallo' : 'border-borde')} />
              {!i.ruta && !i.error && <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50"><Loader2 className="size-4 animate-spin text-white" /></span>}
              <button type="button" onClick={() => quitar(i.clave)} aria-label="Quitar imagen" className="absolute -top-1.5 -right-1.5 rounded-full border border-borde bg-elevado p-0.5 text-tenue"><X className="size-3" /></button>
              {i.error && <p className="mt-0.5 max-w-14 truncate text-[10px] text-fallo" title={i.error}>{i.error}</p>}
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={campo} rows={1} value={dictando && provisional ? `${texto} ${provisional}` : texto} disabled={!activo}
        onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} onPaste={alPegar}
        placeholder={tactil() ? 'Escribe, pega o dicta…' : 'Escribe, pega o dicta… (Intro envía, Mayús+Intro salto de línea)'}
        className="block w-full resize-none bg-transparent px-1.5 py-1 text-[14px] text-texto outline-none placeholder:text-apagado"
      />
      {aviso && <p className="px-1.5 pt-1 text-[12px] text-aviso">{aviso}</p>}
      <div className="mt-1.5 flex items-center gap-1">
        <input ref={selector} type="file" accept="image/*" multiple hidden onChange={(e) => { adjuntar([...e.target.files]); e.target.value = ''; }} />
        <Boton tam="sm" variante="fantasma" disabled={!activo} onClick={() => selector.current?.click()} title="Adjuntar imagen (galería o cámara)"><ImagePlus className="size-4" /></Boton>
        <Boton tam="sm" variante="fantasma" disabled={!activo} onClick={pegar} title="Pegar texto o imagen"><ClipboardPaste className="size-4" /></Boton>
        {Reconocimiento && (
          <Boton tam="sm" variante={dictando ? 'peligro' : 'fantasma'} disabled={!activo} onClick={dictar} title={dictando ? 'Parar el dictado' : 'Dictar'}>
            {dictando ? <><MicOff className="size-4" /> Parar</> : <Mic className="size-4" />}
          </Boton>
        )}
        <Boton tam="sm" variante="primario" disabled={!puede} onClick={mandar} className="ml-auto">
          {subiendo ? <Loader2 className="size-3.5 animate-spin" /> : <SendHorizontal className="size-3.5" />} Enviar
        </Boton>
      </div>
    </div>
  );
}
