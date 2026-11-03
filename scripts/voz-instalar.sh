#!/bin/sh
# Instala la voz de Nullraptor en el volumen (dura entre actualizaciones): entorno Python con Whisper (oír) y
# Kokoro (hablar), y sus modelos (~850 MB). Se puede repetir: lo que ya está no se vuelve a bajar.
#   sh /nullraptor/scripts/voz-instalar.sh
# Después, el panel arranca el servicio solo (al abrir el modo voz del Chat).
set -eu
DIR="${NULLRAPTOR_VOZ:-/estado/sistema/voz}"
AQUI="$(cd "$(dirname "$0")" && pwd)"
KOKORO="https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0"
mkdir -p "$DIR/modelos"
[ -x "$DIR/venv/bin/python" ] || python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q -r "$AQUI/voz/requisitos.txt"
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  if [ ! -s "$DIR/modelos/$f" ]; then
    curl -sSfL -o "$DIR/modelos/$f.tmp" "$KOKORO/$f"
    mv "$DIR/modelos/$f.tmp" "$DIR/modelos/$f"
  fi
done
HF_HOME="$DIR/modelos/hf" "$DIR/venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('${NULLRAPTOR_VOZ_WHISPER:-small}', device='cpu', compute_type='int8')"
echo "Voz instalada en $DIR."
