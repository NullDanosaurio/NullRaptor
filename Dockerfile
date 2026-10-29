# Agente portátil: Ruflo 3.59.17 + Claude Code 2.1.308 (versiones fijadas en package-lock.json).
# shortcut: imagen base fijada por etiqueta exacta, sin digest; añadir @sha256 tras el primer pull verificado.
FROM node:24.22.1-bookworm-slim

# git para worktrees. Sin compiladores: no se construyen módulos nativos.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /agente
COPY package.json package-lock.json ./
# Sin scripts de instalación (igual que la prueba nativa con npm 12): Ruflo funciona sin módulos nativos.
# Solo se ejecuta el de Claude Code, que coloca su binario de plataforma (leído y revisado).
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && node node_modules/@anthropic-ai/claude-code/install.cjs \
 && npm cache clean --force

COPY . .

# Todo el estado por equipo vive en volúmenes (ver compose.yaml); la imagen no lleva credenciales.
ENV HOME=/home/node \
    CLAUDE_CONFIG_DIR=/home/node/.claude \
    CLAUDE_FLOW_MODE=v3 \
    CLAUDE_FLOW_MAX_AGENTS=3 \
    CLAUDE_FLOW_TOPOLOGY=hierarchical \
    DISABLE_AUTOUPDATER=1 \
    npm_config_update_notifier=false \
    PATH=/agente/node_modules/.bin:$PATH

RUN mkdir -p /agente/.swarm /agente/.claude-flow/policy /home/node/.config/ruflo /home/node/.claude \
 && chown -R node:node /agente /home/node
USER node

CMD ["node", "scripts/verificar.mjs"]
