// Acceso a la API del panel y utilidades de datos compartidas por las vistas.
import { useCallback, useEffect, useRef, useState } from 'react';

async function respuesta(r) {
  // Modo red: sin sesión (o con el código cambiado), a la página de entrada.
  if (r.status === 401) { window.location.assign('/entrar'); throw new Error('Hace falta el código de acceso.'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error ?? `Error ${r.status}`);
  return datos;
}

export const get = (ruta) => fetch(ruta, { headers: { Accept: 'application/json' } }).then(respuesta);

// La cabecera X-Nullraptor la exige el servidor en todo lo que cambia algo (protección CSRF).
export const post = (ruta, cuerpo) => fetch(ruta, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Nullraptor': '1' },
  body: JSON.stringify(cuerpo ?? {}),
}).then(respuesta);

/** Datos de una ruta, con refresco opcional cada `cada` ms (se pausa con la pestaña oculta). */
export function useDatos(ruta, { cada = 0 } = {}) {
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: Boolean(ruta) });
  const vigente = useRef(ruta);
  vigente.current = ruta;

  const cargar = useCallback(async () => {
    if (!ruta) return;
    try {
      const datos = await get(ruta);
      if (vigente.current === ruta) setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      if (vigente.current === ruta) setEstado((e) => ({ ...e, error, cargando: false }));
    }
  }, [ruta]);

  useEffect(() => {
    setEstado((e) => ({ datos: e.datos, error: null, cargando: Boolean(ruta) }));
    cargar();
    if (!cada) return undefined;
    const id = setInterval(() => { if (!document.hidden) cargar(); }, cada);
    return () => clearInterval(id);
  }, [cargar, cada, ruta]);

  return { ...estado, recargar: cargar };
}

/** Rutas con almohadilla: #/chat, #/boveda/Proyectos/X.md … → { vista, resto }. */
export function useRuta() {
  const leer = () => {
    const [vista = 'inicio', ...resto] = decodeURIComponent(window.location.hash.replace(/^#\/?/, '')).split('/');
    return { vista: vista || 'inicio', resto: resto.join('/') };
  };
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const cambio = () => setRuta(leer());
    window.addEventListener('hashchange', cambio);
    return () => window.removeEventListener('hashchange', cambio);
  }, []);
  return ruta;
}

export const ir = (destino) => { window.location.hash = `#/${destino}`; };
export const enlace = (vista, resto = '') => `#/${vista}${resto ? `/${resto.split('/').map(encodeURIComponent).join('/')}` : ''}`;

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
/** «hace 5 minutos», «ayer»… a partir de una fecha ISO o milisegundos. */
export function haceCuanto(fecha, ahora = Date.now()) {
  const t = typeof fecha === 'number' ? fecha : Date.parse(fecha);
  if (!Number.isFinite(t)) return '';
  const s = Math.round((t - ahora) / 1000);
  const pasos = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
  let v = s;
  for (const [tam, unidad] of pasos) {
    if (Math.abs(v) < tam) return relativo.format(Math.round(v), unidad);
    v /= tam;
  }
  return '';
}

export function duracion(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}
