// Voz en el navegador para el modo voz del Chat: grabar el micrófono mientras se mantiene pulsado, mandarlo a
// /api/voz/transcribir (Whisper, en el contenedor) y reproducir las respuestas que devuelve /api/voz/hablar (Kokoro).
// El micrófono solo funciona en un origen seguro: este equipo (localhost) o Tailscale (https); por la red de casa
// (http://192.168…) el navegador no lo deja.
import { useCallback, useEffect, useRef, useState } from 'react';
import { get } from './api.js';

const TIPOS = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];
const MIN_MS = 350; // pulsaciones más cortas: sin audio útil

async function pedirAudio(ruta, cuerpo, cabeceras) {
  const r = await fetch(ruta, { method: 'POST', headers: { 'X-Nullraptor': '1', ...cabeceras }, body: cuerpo });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error ?? `Error ${r.status}`);
  }
  return r;
}

export function useVoz() {
  const [estado, setEstado] = useState(null); // { instalada, enMarcha } del servidor
  const [fase, setFase] = useState('libre'); // libre · escuchando · transcribiendo
  const [hablando, setHablando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const grab = useRef(null);
  const cola = useRef(Promise.resolve());
  const sonando = useRef(null);
  const generacion = useRef(0); // al callar, lo que estaba en cola ya no suena

  const micPosible = typeof window !== 'undefined' && window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';
  useEffect(() => { get('/api/voz/estado').then(setEstado).catch(() => setEstado({ instalada: false, enMarcha: false })); }, []);

  /** Empieza a grabar (al pulsar el botón). */
  const empezar = useCallback(async () => {
    if (grab.current || !micPosible) return;
    setAviso(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const tipo = TIPOS.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      const trozos = [];
      rec.ondataavailable = (e) => { if (e.data.size) trozos.push(e.data); };
      rec.start();
      grab.current = { rec, stream, trozos, inicio: Date.now() };
      setFase('escuchando');
    } catch (e) {
      setAviso(e.name === 'NotAllowedError' ? 'Permite el micrófono en el navegador para hablar con Jarvis.' : `Micrófono: ${e.message}`);
    }
  }, [micPosible]);

  /** Deja de grabar (al soltar) y devuelve lo transcrito ('' si no se entendió nada). */
  const terminar = useCallback(async () => {
    const g = grab.current;
    if (!g) return '';
    grab.current = null;
    await new Promise((r) => { g.rec.onstop = r; g.rec.stop(); });
    g.stream.getTracks().forEach((t) => t.stop());
    if (Date.now() - g.inicio < MIN_MS || !g.trozos.length) { setFase('libre'); return ''; }
    setFase('transcribiendo');
    try {
      const blob = new Blob(g.trozos, { type: g.rec.mimeType || 'audio/webm' });
      const r = await pedirAudio('/api/voz/transcribir', blob, { 'Content-Type': blob.type });
      const { texto } = await r.json();
      if (!texto) setAviso('No te he entendido, señor. ¿Puede repetirlo?');
      return texto ?? '';
    } catch (e) { setAviso(`Transcribir: ${e.message}`); return ''; } finally { setFase('libre'); }
  }, []);

  /** Lee un texto en voz alta (en cola: si ya está hablando, espera su turno). */
  const decir = useCallback((texto) => {
    const mia = generacion.current;
    cola.current = cola.current.then(async () => {
      if (mia !== generacion.current) return;
      try {
        const r = await pedirAudio('/api/voz/hablar', JSON.stringify({ texto }), { 'Content-Type': 'application/json' });
        const url = URL.createObjectURL(await r.blob());
        if (mia !== generacion.current) { URL.revokeObjectURL(url); return; }
        const audio = new Audio(url);
        sonando.current = audio;
        setHablando(true);
        await new Promise((fin) => { audio.onended = fin; audio.onerror = fin; audio.onpause = fin; audio.play().catch(fin); });
        URL.revokeObjectURL(url);
      } catch (e) { setAviso(`Hablar: ${e.message}`); } finally { sonando.current = null; setHablando(false); }
    });
  }, []);

  /** Calla al momento (y descarta lo que estaba en cola). */
  const callar = useCallback(() => {
    generacion.current += 1;
    sonando.current?.pause();
  }, []);

  useEffect(() => () => { callar(); grab.current?.stream.getTracks().forEach((t) => t.stop()); }, [callar]);

  return { estado, micPosible, fase, hablando, aviso, setAviso, empezar, terminar, decir, callar };
}
