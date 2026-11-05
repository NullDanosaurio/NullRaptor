# Nullraptor, agente personal portátil: Claude Code 2.1.308 + Codex 0.163.0 + Ruflo 3.59.17 (versiones fijadas en package-lock.json).
# Codex trae su binario en un paquete por plataforma (optionalDependencies): no necesita scripts de instalación.
# Arranque: docker run -it --rm -v nullraptor:/estado ghcr.io/nulldanosaurio/nullraptor   → clave → memoria → menú de proyectos.
# shortcut: imagen base fijada por etiqueta exacta, sin digest; añadir @sha256 tras el primer pull verificado.
# Etapa 1: la web del panel (React + Vite + Tailwind). Sus dependencias solo existen aquí; a la imagen va dist/.
FROM node:24.22.1-bookworm-slim AS panel
WORKDIR /panel
COPY panel/package.json panel/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY panel/ ./
RUN npm run build

FROM node:24.22.1-bookworm-slim

# git para memoria y proyectos. Nullraptor no construye módulos nativos; Python, curl y los compiladores son para lo
# que la IA instale en los proyectos (npm y pip instalan en el volumen, ver NPM_CONFIG_PREFIX más abajo).
# libGL/EGL/X11: CAD con build123d (OCP necesita libGL.so.1 y libX11.so.6) y programas gráficos sin pantalla (Blender).
# sudo (decisión [U] 02/11/2026): la IA puede usar apt; con «paquetes instalar» lo instalado se reinstala solo tras
# cada actualización (scripts/paquetes.mjs, lista en /estado/sistema/apt-paquetes.txt).
RUN apt-get update \
 && apt-get install -y --no-install-recommends git gh ca-certificates curl unzip python3 python3-pip python3-venv build-essential \
      sudo libgl1 libegl1 libglu1-mesa libx11-6 libxrender1 libxext6 libxi6 libxxf86vm1 libxfixes3 libxkbcommon0 libsm6 libfontconfig1 \
 && rm -rf /var/lib/apt/lists/* \
 && echo 'node ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/nullraptor && chmod 0440 /etc/sudoers.d/nullraptor \
 && printf '#!/bin/sh\nexec node /nullraptor/scripts/paquetes.mjs "$@"\n' > /usr/local/bin/paquetes && chmod 0755 /usr/local/bin/paquetes

WORKDIR /nullraptor
COPY package.json package-lock.json ./
# Sin scripts de instalación (igual que la prueba nativa con npm 12): Ruflo funciona sin módulos nativos.
# Solo se ejecuta el de Claude Code, que coloca su binario de plataforma (leído y revisado).
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && node node_modules/@anthropic-ai/claude-code/install.cjs \
 && npm cache clean --force

COPY . .
COPY --from=panel /panel/dist ./panel/dist

# Todo el estado de cada equipo vive en un único volumen /estado: memoria y proyectos clonados,
# memoria y política de Ruflo (junto a su ancla en ~/.config/ruflo) y la configuración de Claude.
# shortcut: sin el motor nativo AgentDB (en Linux se carga y no guarda en el volumen); sql.js persiste en
# CLAUDE_FLOW_MEMORY_PATH igual que en Windows. Reactivarlo cuando AgentDB acepte una ruta dentro del volumen.
#   El cofre no va en la imagen: se monta desde el equipo en CREDENCIALES (ver LEEME).
ENV HOME=/estado/home \
    CREDENCIALES=/cofre/credenciales.cifrado \
    CLAUDE_CONFIG_DIR=/estado/home/.claude \
    TRABAJO_DIR=/estado/trabajo \
    CLAUDE_FLOW_MEMORY_PATH=/estado/ruflo/swarm \
    CLAUDE_FLOW_DISABLE_BRIDGE=1 \
    DISABLE_AUTOUPDATER=1 \
    npm_config_update_notifier=false \
    PANEL_HOST=0.0.0.0 \
    NPM_CONFIG_PREFIX=/estado/sistema \
    PYTHONUSERBASE=/estado/sistema \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    PATH=/nullraptor/node_modules/.bin:/estado/sistema/bin:/estado/home/.local/bin:$PATH
# Lo que la IA instala (npm -g, pip, binarios sueltos en /estado/sistema/bin) va al volumen y sobrevive a las
# actualizaciones. pip, sin permiso en el sistema, instala solo en PYTHONUSERBASE. apt, con sudo y «paquetes».
# Estado de Ruflo (tareas, agentes, sesiones, memoria…): Ruflo lo escribe en .claude-flow/ de su carpeta, que es la
# de la imagen; se enlaza al volumen para que no se pierda al actualizar. preparar.mjs crea las que falten.
RUN mkdir -p /estado/home/.claude /estado/trabajo /estado/sistema/bin /estado/ruflo/swarm /estado/ruflo/policy \
 && ln -s /estado/ruflo/swarm /nullraptor/.swarm \
 && for d in policy tasks agents sessions memory data coordination neural; do \
      mkdir -p /estado/ruflo/$d && rm -rf /nullraptor/.claude-flow/$d && ln -s /estado/ruflo/$d /nullraptor/.claude-flow/$d; \
    done \
 && chown -R node:node /nullraptor /estado
USER node
VOLUME /estado
# Panel web (node panel/servidor.mjs): publicar solo en el equipo, -p 127.0.0.1:4321:4321.
EXPOSE 4321
# Commit con el que se construyó (lo pasa la CI); el panel lo enseña en Ajustes. Al final, para no romper la caché.
ARG REVISION=local
ENV NULLRAPTOR_REVISION=$REVISION

ENTRYPOINT ["node", "/nullraptor/scripts/preparar.mjs"]
