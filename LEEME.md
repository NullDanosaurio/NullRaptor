# Ruflo Portable 0.2.0

Agente personal portátil: Ruflo + Claude Code en un contenedor, con la memoria de Obsidian montada en solo
lectura. Base: el entorno `ruflo-web` del 22/10/2026 (Codex), del que conserva versiones, lockfile, skills,
agentes, comandos y configuración de Ruflo. El prototipo «Ruflo Portable v0.1.1» no estaba en este equipo
el 29/10/2026; si aparece, se compara con este y se integra lo que aporte.

Procedencia: [O] observado · [P] propuesta · [?] pendiente.

## Qué incluye (portable, va en la imagen)

| Componente | Versión / origen |
|---|---|
| Node.js | 24.22.1 (imagen `node:24.22.1-bookworm-slim`) |
| Ruflo (+ `@claude-flow/cli`) | 3.59.17, fijado en `package-lock.json` |
| Claude Code | 2.1.308, fijado |
| Adaptador Codex de Ruflo | 3.0.5 (el CLI de Codex **no** va en la imagen) |
| Instrucciones | `CLAUDE.md`, `AGENTS.md` |
| Skills, agentes, comandos | `.claude/skills`, `.claude/agents`, `.claude/commands`, `.agents/skills` |
| Config. de Ruflo | `.claude-flow/config.yaml` (3 agentes, jerárquico, sin autoescalado) |
| MCP | `.mcp.json` con ruta relativa (`node node_modules/ruflo/bin/ruflo.js mcp start`) |

## Qué es por equipo (volúmenes o `.env`, nunca en la imagen ni en Git)

| Dato | Dónde | Notas |
|---|---|---|
| Ruta del vault de Obsidian | `.env` → `BOVEDA_RUTA` | Montado en `/boveda:ro` |
| Memoria de Ruflo | volumen `ruflo-memoria` → `.swarm/` | |
| Registro de políticas de Ruflo | volumen `ruflo-politica` → `.claude-flow/policy/` | Debe ir **junto** a `ruflo-confianza` |
| Ancla de confianza de Ruflo | volumen `ruflo-confianza` → `~/.config/ruflo` | Si se pierde uno de los dos, el MCP rechaza la memoria (`policy-anchor-log-*`) |
| Sesión de Claude (OAuth) | volumen `claude-cuenta` → `~/.claude` | Se inicia en cada equipo con `claude` → `/login` |
| Notion | conector OAuth de Claude | Se reconecta en cada equipo; no se copian tokens |

## Uso

Requisitos: Docker Desktop (Windows: con WSL 2) o Docker Engine + Compose v2. Git.

```powershell
git clone <este repositorio> RufloPortable; cd RufloPortable
Copy-Item .env.example .env          # ajustar BOVEDA_RUTA
docker compose build
docker compose run --rm agente       # verificación (scripts/verificar.mjs); repetir: «arranques» debe subir
docker compose run --rm agente claude   # sesión interactiva; la primera vez, /login
```

Fuera de Docker (mismo resultado que el contenedor):

```powershell
npm ci --ignore-scripts; node node_modules/@anthropic-ai/claude-code/install.cjs
node scripts/verificar.mjs
```

`--ignore-scripts`: npm 12 bloquea los scripts de instalación por defecto y Ruflo funciona sin sus módulos
nativos (better-sqlite3, hnswlib, onnxruntime, sharp). Solo Claude Code necesita el suyo, que únicamente coloca
el binario de la plataforma.

## Notion y trabajo sin conexión [P]

Notion organiza requisitos, tareas, decisiones y evidencias; Ruflo ejecuta; Obsidian conserva memoria documental
(decisión del 28/10/2026). Si Notion no está disponible (sin OAuth en el equipo, límite de bloques o sin red):

1. El agente trabaja con la memoria de Obsidian (solo lectura) y la memoria de Ruflo.
2. Los cambios de estado se anotan en Ruflo, namespace `pendiente-notion`, con fecha y evidencia.
3. Al recuperar Notion se vuelcan a mano o con `/cerrar`. No se dan por sincronizados hasta verlos en Notion.

## Estado de las pruebas

| Prueba | Resultado |
|---|---|
| Instalación limpia desde lockfile en Windows (npm 12, `HOME` aislado) | [O] 29/10/2026: correcta, 86 s |
| MCP de Ruflo con `HOME` vacío | [O] 367 herramientas |
| Memoria por MCP: guardar, leer y persistir entre arranques | [O] contador 1 → 2 |
| Claude Code 2.1.308 tras `install.cjs` | [O] `claude --version` correcto |
| Construir y arrancar la imagen Docker | [?] Docker no instalado en este equipo |
| Vault en solo lectura dentro del contenedor | [?] depende de Docker |
| Login OAuth de Claude y Notion dentro del contenedor | [?] requiere a Daniel |
| Otro equipo | [?] pendiente |
| Codex dentro del contenedor | Fuera del alcance mínimo |

Registro de comandos y resultados: `docs/registro.md`.
