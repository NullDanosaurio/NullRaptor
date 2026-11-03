"""Servicio de voz de Nullraptor: oír (Whisper) y hablar (Kokoro), todo en local y con el procesador.

Lo arranca el panel (panel/lib/voz.mjs) con el Python del entorno de voz (/estado/sistema/voz/venv, lo crea
scripts/voz-instalar.sh). Escucha solo en 127.0.0.1: el panel hace de puerta, con sus controles de acceso.
  GET  /estado       {"listo": true, "whisper": "small", "voz": "em_alex"}
  POST /transcribir  cuerpo: audio en cualquier formato (webm/opus del navegador, wav…) → {"texto": "…"}
  POST /hablar       {"texto": "…", "voz"?: "em_alex", "velocidad"?: 1.0} → audio/wav
Los modelos se cargan la primera vez que se usan y se quedan en memoria (~1 GB entre los dos).
"""
import io
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DIR = os.environ.get('NULLRAPTOR_VOZ', '/estado/sistema/voz')
MODELOS = os.path.join(DIR, 'modelos')
os.environ.setdefault('HF_HOME', os.path.join(MODELOS, 'hf'))
os.environ.setdefault('HF_HUB_OFFLINE', '1')  # el modelo ya se bajó al instalar: nada de red al usarlo
WHISPER = os.environ.get('NULLRAPTOR_VOZ_WHISPER', 'small')
VOZ = os.environ.get('NULLRAPTOR_VOZ_KOKORO', 'em_alex')
MAX_AUDIO = 25 * 1024 * 1024
MAX_TEXTO = 4000

_cerrojo_oir = threading.Lock()
_cerrojo_hablar = threading.Lock()
_modelos = {}


def _whisper():
    if 'whisper' not in _modelos:
        from faster_whisper import WhisperModel
        _modelos['whisper'] = WhisperModel(WHISPER, device='cpu', compute_type='int8', cpu_threads=max(1, (os.cpu_count() or 4) // 2))
    return _modelos['whisper']


def _kokoro():
    if 'kokoro' not in _modelos:
        from kokoro_onnx import Kokoro
        _modelos['kokoro'] = Kokoro(os.path.join(MODELOS, 'kokoro-v1.0.onnx'), os.path.join(MODELOS, 'voices-v1.0.bin'))
    return _modelos['kokoro']


def transcribir(audio: bytes, idioma: str = 'es') -> str:
    # PyAV (dentro de faster-whisper) decodifica webm/opus, ogg, mp3, wav… sin ffmpeg instalado.
    with tempfile.NamedTemporaryFile(suffix='.audio') as f:
        f.write(audio)
        f.flush()
        with _cerrojo_oir:
            segmentos, _ = _whisper().transcribe(f.name, language=idioma or None, beam_size=1, vad_filter=True)
            return ' '.join(s.text.strip() for s in segmentos).strip()


def hablar(texto: str, voz: str = VOZ, velocidad: float = 1.0) -> bytes:
    import soundfile as sf
    idioma = 'es' if voz.startswith(('e', 'E')) else 'en-gb' if voz.startswith('b') else 'en-us'
    with _cerrojo_hablar:
        audio, frecuencia = _kokoro().create(texto, voice=voz, speed=velocidad, lang=idioma)
    salida = io.BytesIO()
    sf.write(salida, audio, frecuencia, format='WAV', subtype='PCM_16')
    return salida.getvalue()


class Manejador(BaseHTTPRequestHandler):
    def log_message(self, *args):  # sin ruido en el registro del panel
        pass

    def _responder(self, codigo, cuerpo, tipo='application/json; charset=utf-8'):
        if isinstance(cuerpo, (dict, list)):
            cuerpo = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', tipo)
        self.send_header('Content-Length', str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def _cuerpo(self, maximo):
        largo = int(self.headers.get('Content-Length') or 0)
        if largo <= 0 or largo > maximo:
            raise ValueError('cuerpo vacío o demasiado grande')
        return self.rfile.read(largo)

    def do_GET(self):
        if self.path == '/estado':
            return self._responder(200, {'listo': True, 'whisper': WHISPER, 'voz': VOZ, 'cargados': sorted(_modelos)})
        return self._responder(404, {'error': 'No existe.'})

    def do_POST(self):
        try:
            if self.path.startswith('/transcribir'):
                idioma = self.headers.get('X-Idioma', 'es')
                return self._responder(200, {'texto': transcribir(self._cuerpo(MAX_AUDIO), idioma)})
            if self.path == '/hablar':
                datos = json.loads(self._cuerpo(64 * 1024).decode('utf-8'))
                texto = str(datos.get('texto') or '').strip()[:MAX_TEXTO]
                if not texto:
                    return self._responder(400, {'error': 'Falta el texto.'})
                voz = str(datos.get('voz') or VOZ)
                velocidad = min(2.0, max(0.5, float(datos.get('velocidad') or 1.0)))
                return self._responder(200, hablar(texto, voz, velocidad), 'audio/wav')
            return self._responder(404, {'error': 'No existe.'})
        except Exception as e:  # el panel enseña el motivo
            return self._responder(500, {'error': f'{type(e).__name__}: {e}'})


if __name__ == '__main__':
    puerto = int(os.environ.get('NULLRAPTOR_VOZ_PUERTO', '4330'))
    servidor = ThreadingHTTPServer(('127.0.0.1', puerto), Manejador)
    print(f'Voz de Nullraptor en 127.0.0.1:{puerto} (Whisper {WHISPER}, voz {VOZ})', file=sys.stderr, flush=True)
    if '--precargar' in sys.argv:  # carga en segundo plano: la primera petición ya no espera
        threading.Thread(target=lambda: (_whisper(), _kokoro()), daemon=True).start()
    servidor.serve_forever()
