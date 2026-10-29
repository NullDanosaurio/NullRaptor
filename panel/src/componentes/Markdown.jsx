// Markdown con los enlaces de Obsidian ([[nota]], [[nota|alias]]) resueltos a notas de la bóveda.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { enlace } from '../api.js';

const ROTO = '#nota-inexistente';

/** Índice nombre (sin mayúsculas) → ruta, para resolver [[enlaces]]. */
export function indiceNotas(notas = []) {
  const indice = new Map();
  for (const n of notas) {
    indice.set(n.nombre.toLowerCase(), n.ruta);
    indice.set(n.ruta.replace(/\.md$/i, '').toLowerCase(), n.ruta);
  }
  return indice;
}

/** Sustituye [[...]] fuera de los bloques de código. */
export function resolverEnlaces(texto, indice) {
  return texto.split(/(```[\s\S]*?```)/g).map((trozo, i) => (i % 2 ? trozo : trozo.replace(
    /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g,
    (_, destino, _ancla, alias) => {
      const ruta = indice?.get(destino.trim().toLowerCase());
      const etiqueta = (alias ?? destino).trim().replace(/[[\]]/g, '');
      return `[${etiqueta}](${ruta ? enlace('boveda', ruta) : ROTO})`;
    },
  ))).join('');
}

const componentes = {
  a: ({ href = '', children }) => {
    if (href === ROTO) return <a className="roto" title="Esta nota aún no existe">{children}</a>;
    const externo = /^https?:/i.test(href);
    return <a href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{children}</a>;
  },
  table: ({ children }) => <div className="tabla"><table>{children}</table></div>,
  img: ({ alt }) => <span className="text-apagado">[imagen: {alt}]</span>, // sin cargas externas
};

export default function Markdown({ texto, indice, className = '' }) {
  return (
    <div className={`prosa ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
        {resolverEnlaces(texto ?? '', indice)}
      </ReactMarkdown>
    </div>
  );
}
