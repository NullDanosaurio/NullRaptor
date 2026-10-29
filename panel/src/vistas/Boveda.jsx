// Bóveda: árbol de notas, búsqueda, lectura con [[enlaces]] y retroenlaces, y cambios recientes. Solo lectura.
import { ArrowLeft, BookOpen, ChevronRight, FileText, Folder, FolderOpen, GitCommitHorizontal, Link2, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { enlace, haceCuanto, useDatos } from '../api.js';
import Markdown, { indiceNotas } from '../componentes/Markdown.jsx';
import { Cargando, cx, Fallo, Insignia, Tarjeta, Vacio } from '../componentes/ui.jsx';

const INICIO = '00-Inicio.md';

/** Lista plana de notas → árbol { carpetas: Map, notas: [] }. */
function construirArbol(notas) {
  const raiz = { carpetas: new Map(), notas: [] };
  for (const n of notas) {
    const partes = n.ruta.split('/');
    let nodo = raiz;
    for (const p of partes.slice(0, -1)) {
      if (!nodo.carpetas.has(p)) nodo.carpetas.set(p, { carpetas: new Map(), notas: [] });
      nodo = nodo.carpetas.get(p);
    }
    nodo.notas.push(n);
  }
  return raiz;
}

function leerAbiertas() {
  try { return new Set(JSON.parse(localStorage.getItem('boveda.abiertas') ?? '["Proyectos","Conocimiento"]')); } catch { return new Set(['Proyectos', 'Conocimiento']); }
}

function Nodo({ nombre, nodo, ruta, actual, abiertas, alternar, nivel }) {
  const abierta = abiertas.has(ruta);
  const total = (n) => n.notas.length + [...n.carpetas.values()].reduce((s, c) => s + total(c), 0);
  return (
    <li>
      <button type="button" onClick={() => alternar(ruta)} aria-expanded={abierta} className="flex w-full items-center gap-1.5 rounded-lg py-1.5 pr-2 text-left text-[13px] text-tenue hover:bg-elevado/60 hover:text-texto" style={{ paddingLeft: 8 + nivel * 14 }}>
        <ChevronRight className={cx('size-3.5 shrink-0 text-apagado transition-transform duration-150', abierta && 'rotate-90')} />
        {abierta ? <FolderOpen className="size-4 shrink-0 text-raptor-oscuro" strokeWidth={1.7} /> : <Folder className="size-4 shrink-0 text-apagado" strokeWidth={1.7} />}
        <span className="flex-1 truncate">{nombre}</span>
        <span className="text-[11px] text-apagado tabular-nums">{total(nodo)}</span>
      </button>
      {abierta && <Rama nodo={nodo} ruta={ruta} actual={actual} abiertas={abiertas} alternar={alternar} nivel={nivel + 1} />}
    </li>
  );
}

function Rama({ nodo, ruta, actual, abiertas, alternar, nivel }) {
  const carpetas = [...nodo.carpetas.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  return (
    <ul>
      {carpetas.map(([nombre, hijo]) => (
        <Nodo key={nombre} nombre={nombre} nodo={hijo} ruta={ruta ? `${ruta}/${nombre}` : nombre} actual={actual} abiertas={abiertas} alternar={alternar} nivel={nivel} />
      ))}
      {nodo.notas.map((n) => (
        <li key={n.ruta}>
          <a href={enlace('boveda', n.ruta)} aria-current={actual === n.ruta ? 'page' : undefined} className={cx('flex items-center gap-1.5 rounded-lg py-1.5 pr-2 text-[13px]', actual === n.ruta ? 'bg-elevado text-white' : 'text-tenue hover:bg-elevado/60 hover:text-texto')} style={{ paddingLeft: 8 + nivel * 14 + 20 }}>
            <FileText className={cx('size-3.5 shrink-0', actual === n.ruta ? 'text-raptor' : 'text-apagado')} strokeWidth={1.7} />
            <span className="truncate">{n.nombre}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Busqueda({ consulta }) {
  const [diferida, setDiferida] = useState(consulta);
  useEffect(() => { const t = setTimeout(() => setDiferida(consulta), 220); return () => clearTimeout(t); }, [consulta]);
  const { datos, cargando } = useDatos(diferida.trim().length >= 2 ? `/api/boveda/buscar?q=${encodeURIComponent(diferida)}` : null);
  if (diferida.trim().length < 2) return <p className="px-3 py-2 text-[12px] text-apagado">Escribe al menos 2 letras.</p>;
  if (cargando && !datos) return <Cargando className="px-3 py-2" texto="Buscando…" />;
  if (!datos?.length) return <p className="px-3 py-2 text-[12px] text-apagado">Nada encontrado.</p>;
  return (
    <ul className="space-y-0.5">
      {datos.map((r) => (
        <li key={r.ruta}>
          <a href={enlace('boveda', r.ruta)} className="block rounded-lg px-3 py-2 hover:bg-elevado/60">
            <span className="block truncate text-[13px] text-texto">{r.nombre}</span>
            <span className="block truncate text-[11px] text-apagado">{r.ruta}</span>
            {r.fragmento && <span className="mt-0.5 line-clamp-2 block text-[12px] text-tenue">{r.fragmento}</span>}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Nota({ ruta, indice }) {
  const { datos, error, cargando } = useDatos(`/api/boveda/nota?ruta=${encodeURIComponent(ruta)}`, { cada: 15_000 });
  if (cargando && !datos) return <div className="p-8"><Cargando /></div>;
  if (!datos) return <div className="p-8"><Fallo error={error} /></div>;
  const migas = ruta.split('/');
  const campos = Object.entries(datos.datos ?? {}).filter(([k]) => k !== 'repo');

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-6 md:px-8 xl:grid-cols-[1fr_240px]">
        <article className="min-w-0 animate-entrar">
          <nav aria-label="Ruta" className="mb-4 flex flex-wrap items-center gap-1 text-[12px] text-apagado">
            <a href="#/boveda" className="text-apagado hover:text-texto md:hidden" aria-label="Volver"><ArrowLeft className="mr-1 size-4" /></a>
            <BookOpen className="size-3.5" />
            {migas.map((m, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight className="size-3" />}<span className={i === migas.length - 1 ? 'text-tenue' : ''}>{m.replace(/\.md$/i, '')}</span></span>)}
          </nav>
          {(campos.length > 0 || datos.datos?.repo) && (
            <div className="mb-5 flex flex-wrap gap-1.5">
              {campos.map(([k, v]) => <Insignia key={k} tono={k === 'tipo' ? 'raptor' : 'neutro'}>{k === 'tipo' ? v : `${k}: ${v}`}</Insignia>)}
              {datos.datos?.repo && <Insignia>repo: {datos.datos.repo.replace(/^https:\/\/github\.com\//, '')}</Insignia>}
            </div>
          )}
          {datos.demasiadoGrande ? <Vacio titulo="Nota demasiado grande para mostrarla aquí" /> : <Markdown texto={datos.cuerpo} indice={indice} className="text-[15px]" />}
          <p className="mt-10 border-t border-borde pt-4 text-[12px] text-apagado">Modificada {haceCuanto(datos.cambiada)} · solo lectura (se edita en Obsidian; el agente escribe en la rama «agente»)</p>
        </article>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <Tarjeta titulo={`Retroenlaces · ${datos.retroenlaces.length}`} icono={Link2} cuerpo="p-2">
            {datos.retroenlaces.length ? datos.retroenlaces.map((r) => (
              <a key={r} href={enlace('boveda', r)} className="block truncate rounded-lg px-2.5 py-1.5 text-[13px] text-tenue hover:bg-elevado hover:text-texto">{r.split('/').pop().replace(/\.md$/i, '')}</a>
            )) : <p className="px-2.5 py-1.5 text-[12px] text-apagado">Ninguna nota enlaza aquí.</p>}
          </Tarjeta>
          {datos.enlaces.length > 0 && (
            <Tarjeta titulo={`Enlaza a · ${datos.enlaces.length}`} icono={ChevronRight} cuerpo="p-2">
              {datos.enlaces.map((e) => {
                const destino = indice.get(e.toLowerCase());
                return destino
                  ? <a key={e} href={enlace('boveda', destino)} className="block truncate rounded-lg px-2.5 py-1.5 text-[13px] text-tenue hover:bg-elevado hover:text-texto">{e}</a>
                  : <span key={e} className="block truncate px-2.5 py-1.5 text-[13px] text-apagado line-through decoration-dotted" title="Aún no existe">{e}</span>;
              })}
            </Tarjeta>
          )}
        </aside>
      </div>
    </div>
  );
}

function Cambios() {
  const { datos } = useDatos('/api/boveda/cambios', { cada: 30_000 });
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <h2 className="mb-1 text-[22px] font-semibold tracking-tight text-white">Bóveda</h2>
        <p className="mb-6 text-[13px] text-apagado">Memoria compartida entre proyectos y sesiones. Elige una nota o busca a la izquierda.</p>
        <Tarjeta titulo="Cambios recientes" icono={GitCommitHorizontal} cuerpo="p-2">
          {!datos && <Cargando className="p-3" />}
          {datos?.map((c) => (
            <div key={c.hash} className="rounded-xl px-3 py-2.5">
              <p className="text-[13px] text-texto">{c.asunto}</p>
              <p className="mt-0.5 text-[11px] text-apagado"><span className="font-mono">{c.hash}</span> · {c.autor} · {haceCuanto(c.fecha)}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {c.archivos.filter((a) => a.endsWith('.md')).map((a) => <a key={a} href={enlace('boveda', a)} className="rounded-md border border-borde bg-elevado/60 px-2 py-0.5 text-[11px] text-tenue hover:border-raptor/40 hover:text-raptor">{a.replace(/\.md$/, '')}</a>)}
              </div>
            </div>
          ))}
        </Tarjeta>
      </div>
    </div>
  );
}

export default function Boveda({ resto }) {
  const { datos: notas, error } = useDatos('/api/boveda/notas', { cada: 30_000 });
  const [consulta, setConsulta] = useState('');
  const [abiertas, setAbiertas] = useState(leerAbiertas);
  const arbol = useMemo(() => construirArbol(notas ?? []), [notas]);
  const indice = useMemo(() => indiceNotas(notas ?? []), [notas]);
  const ruta = resto || null;

  // Al abrir una nota, desplegar sus carpetas.
  useEffect(() => {
    if (!ruta) return;
    const partes = ruta.split('/').slice(0, -1);
    setAbiertas((a) => { const n = new Set(a); partes.forEach((_, i) => n.add(partes.slice(0, i + 1).join('/'))); return n; });
  }, [ruta]);
  useEffect(() => { try { localStorage.setItem('boveda.abiertas', JSON.stringify([...abiertas])); } catch {} }, [abiertas]);
  const alternar = (r) => setAbiertas((a) => { const n = new Set(a); if (n.has(r)) n.delete(r); else n.add(r); return n; });

  return (
    <div className="flex h-full">
      <aside className={cx('w-full shrink-0 flex-col border-r border-borde bg-panel/50 md:flex md:w-72', ruta ? 'hidden' : 'flex')}>
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center justify-between px-1 pb-3">
            <h1 className="text-[15px] font-semibold text-white">Bóveda</h1>
            <span className="text-[11px] text-apagado">{notas ? `${notas.length} notas` : ''}</span>
          </div>
          <label className="flex h-9 items-center gap-2 rounded-xl border border-borde bg-elevado/60 px-3 focus-within:border-raptor/40">
            <Search className="size-4 text-apagado" />
            <input value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar en la bóveda…" aria-label="Buscar en la bóveda" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-apagado" />
            {consulta && <button type="button" onClick={() => setConsulta('')} aria-label="Borrar búsqueda" className="text-apagado hover:text-texto"><X className="size-3.5" /></button>}
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <Fallo error={error} className="mx-1" />
          {consulta ? <Busqueda consulta={consulta} /> : !notas ? <Cargando className="px-3" /> : (
            <>
              {notas.some((n) => n.ruta === INICIO) && (
                <a href={enlace('boveda', INICIO)} className={cx('mb-1 flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px]', ruta === INICIO ? 'bg-elevado text-white' : 'text-tenue hover:bg-elevado/60')}>
                  <BookOpen className="size-3.5 text-raptor" /> Inicio
                </a>
              )}
              <Rama nodo={{ carpetas: arbol.carpetas, notas: arbol.notas.filter((n) => n.ruta !== INICIO) }} ruta="" actual={ruta} abiertas={abiertas} alternar={alternar} nivel={0} />
            </>
          )}
        </div>
      </aside>
      <section className={cx('min-w-0 flex-1', !ruta && 'hidden md:block')}>
        {ruta ? <Nota key={ruta} ruta={ruta} indice={indice} /> : <Cambios />}
      </section>
    </div>
  );
}
