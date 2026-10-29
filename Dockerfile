# Nullraptor, agente personal portátil: Ruflo 3.59.17 + Claude Code 2.1.308 (versiones fijadas en package-lock.json).
# Arranque: docker run -it --rm -v nullraptor:/estado ghcr.io/nulldanosaurio/nullraptor   → clave → memoria → menú de proyectos.
# shortcut: imagen base fijada por etiqueta exacta, sin digest; añadir @sha256 tras el primer pull verificado.
FROM node:24.22.1-bookworm-slim

# git para memoria y proyectos. Sin compiladores: no se construyen módulos nativos.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /nullraptor
COPY package.json package-lock.json ./
# Sin scripts de instalación (igual que la prueba nativa con npm 12): Ruflo funciona sin módulos nativos.
# Solo se ejecuta el de Claude Code, que coloca su binario de plataforma (leído y revisado).
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && node node_modules/@anthropic-ai/claude-code/install.cjs \
 && npm cache clean --force

COPY . .

# Todo el estado de cada equipo vive en un único volumen /estado: memoria y proyectos clonados,
# memoria y política de Ruflo (junto a su ancla en ~/.config/ruflo) y la configuración de Claude.
# shortcut: sin el motor nativo AgentDB (en Linux se carga y no guarda en el volumen); sql.js persiste en
# CLAUDE_FLOW_MEMORY_PATH igual que en Windows. Reactivarlo cuando AgentDB acepte una ruta dentro del volumen.
ENV HOME=/estado/home \
    CLAUDE_CONFIG_DIR=/estado/home/.claude \
    TRABAJO_DIR=/estado/trabajo \
    CLAUDE_FLOW_MEMORY_PATH=/estado/ruflo/swarm \
    CLAUDE_FLOW_DISABLE_BRIDGE=1 \
    DISABLE_AUTOUPDATER=1 \
    npm_config_update_notifier=false \
    PATH=/nullraptor/node_modules/.bin:$PATH
RUN mkdir -p /estado/home/.claude /estado/trabajo /estado/ruflo/swarm /estado/ruflo/policy \
 && ln -s /estado/ruflo/swarm /nullraptor/.swarm \
 && ln -s /estado/ruflo/policy /nullraptor/.claude-flow/policy \
 && chown -R node:node /nullraptor /estado
USER node
VOLUME /estado

ENTRYPOINT ["node", "/nullraptor/scripts/preparar.mjs"]
