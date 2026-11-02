// Traer un proyecto al equipo: crear uno nuevo (repositorio privado en GitHub + nota en la bóveda) o clonar uno por
// su URL. Por Tailscale pide la passkey (como la terminal).
import { FolderPlus, GitBranchPlus, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { ir, post, useDatos } from '../api.js';
import { usePasskey } from './Passkey.jsx';
import { Boton, cx, Fallo } from './ui.jsx';

const MODOS = [
  { id: 'crear', nombre: 'Nuevo', icono: FolderPlus },
  { id: 'clonar', nombre: 'Clonar por URL', icono: GitBranchPlus },
];

export default function TraerProyecto({ alCerrar, alTraer }) {
  const { datos: ajustes } = useDatos('/api/ajustes');
  const [modo, setModo] = useState('crear');
  const [nombre, setNombre] = useState('');
  const [url, setUrl] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [fallo, setFallo] = useState(null);
  const { intentar, aviso } = usePasskey(setFallo);
  const sinToken = modo === 'crear' && ajustes && !ajustes.github;

  const enviar = (e) => {
    e.preventDefault();
    intentar(async () => {
      setTrabajando(true);
      try {
        const r = await post(`/api/proyectos/${modo}`, modo === 'crear' ? { nombre: nombre.trim() } : { url: url.trim(), nombre: nombre.trim() || undefined });
        alTraer?.(r);
        ir(`proyectos/${r.nombre}`);
      } finally { setTrabajando(false); }
    });
  };

  const campo = 'h-10 w-full rounded-xl border border-borde bg-elevado/60 px-3 text-[14px] text-texto outline-none placeholder:text-apagado focus:border-raptor/40';
  return (
    <form onSubmit={enviar} className="rounded-2xl border border-borde bg-panel p-4 animate-entrar">
      <div className="mb-3 flex items-center gap-2">
        <div role="tablist" className="flex gap-1 rounded-full bg-elevado p-0.5">
          {MODOS.map(({ id, nombre: n, icono: Icono }) => (
            <button key={id} type="button" role="tab" aria-selected={modo === id} onClick={() => { setModo(id); setFallo(null); }}
              className={cx('flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors', modo === id ? 'bg-borde-fuerte text-white' : 'text-apagado hover:text-texto')}>
              <Icono className="size-3.5" /> {n}
            </button>
          ))}
        </div>
        <Boton tam="icono" variante="fantasma" className="ml-auto" aria-label="Cerrar" onClick={alCerrar}><X className="size-4" /></Boton>
      </div>
      {aviso}
      {modo === 'clonar' && (
        <label className="mb-2 block text-[12px] text-apagado">URL del repositorio (https)
          <input className={cx(campo, 'mt-1 font-mono text-[13px]')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/usuario/repositorio.git" required autoFocus inputMode="url" />
        </label>
      )}
      <label className="block text-[12px] text-apagado">{modo === 'crear' ? 'Nombre del repositorio' : 'Nombre de la carpeta (opcional)'}
        <input className={cx(campo, 'mt-1')} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={modo === 'crear' ? 'MiProyecto' : 'el del repositorio'} required={modo === 'crear'} autoFocus={modo === 'crear'} pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,99}" title="Letras, números, punto, guion y guion bajo" />
      </label>
      <p className="mt-2 text-[12px] text-apagado">
        {modo === 'crear'
          ? 'Crea un repositorio privado en tu cuenta de GitHub, su nota en la bóveda (Proyectos/) y lo descarga en este equipo.'
          : 'Lo descarga en este equipo y, si la bóveda no lo conoce, le crea su nota en Proyectos/.'}
      </p>
      {sinToken && <p className="mt-2 text-[12px] text-aviso">Falta GITHUB_TOKEN en el cofre: sin él no se pueden crear repositorios.</p>}
      <Fallo error={fallo} className="mt-3" />
      <div className="mt-3 flex justify-end">
        <Boton type="submit" variante="primario" disabled={trabajando || sinToken}>
          {trabajando ? <><Loader2 className="size-4 animate-spin" /> {modo === 'crear' ? 'Creando…' : 'Clonando…'}</> : modo === 'crear' ? 'Crear proyecto' : 'Clonar'}
        </Boton>
      </div>
    </form>
  );
}
