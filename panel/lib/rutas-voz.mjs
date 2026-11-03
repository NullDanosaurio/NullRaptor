// Rutas de la voz (panel/lib/voz.mjs). Mismas reglas de acceso que el resto del panel (las aplica servidor.mjs antes).
//   GET  /api/voz/estado       { instalada, enMarcha }
//   POST /api/voz/transcribir  cuerpo: audio del micrófono (webm/opus, ogg, wav…) → { texto }
//   POST /api/voz/hablar       { texto } → audio/wav
const MAX_AUDIO = 25 * 1024 * 1024;

function leerAudio(req) {
  return new Promise((listo, mal) => {
    const trozos = [];
    let tam = 0;
    req.on('data', (t) => {
      tam += t.length;
      if (tam > MAX_AUDIO) { mal(Object.assign(new Error('Audio demasiado largo.'), { codigo: 413 })); req.destroy(); return; }
      trozos.push(t);
    });
    req.on('end', () => listo(Buffer.concat(trozos)));
    req.on('error', mal);
  });
}

export function crearRutasVoz({ voz, leerCuerpo, json }) {
  return async function manejar(req, res, p) {
    if (!p.startsWith('/api/voz/')) return false;
    if (p === '/api/voz/estado' && req.method === 'GET') { json(res, 200, await voz.estado()); return true; }
    if (p === '/api/voz/transcribir' && req.method === 'POST') { json(res, 200, await voz.transcribir(await leerAudio(req), req.headers['x-idioma'])); return true; }
    if (p === '/api/voz/hablar' && req.method === 'POST') {
      const { texto } = await leerCuerpo(req);
      const wav = await voz.hablar(texto);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.length, 'Cache-Control': 'no-store' });
      res.end(wav);
      return true;
    }
    json(res, 404, { error: 'No existe.' });
    return true;
  };
}
