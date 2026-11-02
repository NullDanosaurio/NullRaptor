# Registro de trabajo

## 02/11/2026 — Fase 3 terminada: herramientas en caliente (F3-3, F3-4, F3-5)
- [O] Las tareas F3-x/F4/F5 que se crearon en Ruflo no están (`task_list` vacía); queda la nota del plan en su
  memoria. Lo que faltaba de la fase se reconstruye desde el código.
- F3-3: las aprobadas entran en `.mcp-agente.json` como `herramienta-<id>` con un lanzador
  (`scripts/herramienta-mcp.mjs`) que comprueba la huella **en cada arranque**; reciben solo PATH, HOME, idioma y sus
  variables del cofre. El panel rehace la configuración al aprobar o desactivar y antes de abrir cada sesión remota.
- F3-4: pestaña **Herramientas** del panel: estados, archivos para revisar y aprobar o desactivar. Se aprueba la huella
  revisada (si cambió, 409). Desde este equipo o por Tailscale con passkey confirmada; con solo el código, no.
- F3-5: `config/claude-global.md` explica a la IA cómo crear una herramienta y que la deja propuesta.
- Pruebas [O]: 87/87. Real: panel en otro puerto, herramienta MCP «hora» sin dependencias, aprobada por la API y
  respondiendo a `initialize`, `tools/list` y `tools/call` a través del lanzador.
- [?] Sin probar: que Claude Code la cargue en una sesión real (gasta suscripción) y la vista en el móvil.

## 31/10/2026 — Reestructuración, fase 3 (herramientas), Codex en la imagen, terminal móvil y actualización automática
- [U] Se sigue el plan de 5 fases del 30/10 (tareas en Ruflo). F3-1: formato de herramientas propias
  (`$TRABAJO_DIR/herramientas/<id>/herramienta.json`). F3-2: aprobación con huella sha256 en
  `~/.nullraptor/herramientas.json`; si cambia un archivo, deja de estar activa.
- [O] Codex no estaba en la imagen (solo se buscaba el de la app de Windows): `@openai/codex` 0.163.0 fijado; sesión de
  ChatGPT iniciada con `codex login --device-auth` y probada.
- [U] Prioridad: la terminal del panel en el móvil no dejaba pegar, dictar, adjuntar imágenes ni abrir enlaces →
  caja de escritura bajo la terminal, imágenes en `$TRABAJO_DIR/adjuntos` y enlaces pulsables. [?] Sin probar en
  el móvil (no hay navegador en el contenedor).
- [U] Actualización automática: sola si no hay sesiones abiertas; si las hay, aviso y botón «Actualizar ahora».
  [?] La parte de Windows (tarea programada, `-Actualizar`) está sin probar: no hay PowerShell en el contenedor.
- [O] El estado del flujo de TuRinconDeLectura se perdió al moverlo a `$TRABAJO_DIR/flujo`; reconstruido desde los
  commits de `main` (19/19 integradas).

## 29/10/2026 — Auditoría y paquete portátil 0.2.0

### Encontrado [O]
- Ruflo real: 3.59.17 fijado en `C:\Desarrollo\TuRinconDeLectura` (flujo Codex + Claude) y en `ruflo-web`
  (`Documents\Codex\2026-10-22\co\outputs\ruflo-web`, commit `ce9d64f`). `ruflo --version` → `ruflo v3.59.17`.
- Prototipo «Ruflo Portable v0.1.1» con Docker: no localizado en `C:\Desarrollo`, Descargas, Escritorio, Documentos
  ni sesiones de Codex.
- Equipo: Windows 11 Pro 26200, Intel Core 9 270H (20 hilos), 31,7 GB RAM, 358 GB libres en C:, hipervisor activo.
  Git 2.53.0, Node 24.22.1, npm 12.2.1. **Docker no instalado; WSL no instalado.**
- MCP `.mcp.json` de ambos proyectos apunta al Node del runtime de Codex (ruta propia de este PC).

### Incidencia en TuRinconDeLectura [O]
- El MCP de Ruflo devuelve `policy-anchor-log-missing` en `memory_search` y `memory_stats`.
- `ruflo policy verify` → `valid:false, length:0, anchors:{log:false, mirror:true}`: falta
  `.claude-flow/policy/ledger-anchors.json`; el espejo `~/.config/ruflo/policy-trust/3e0c…/ledger-anchor-head.json`
  (23/10/2026 16:03) existe. Registro vacío (0 recibos).
- La memoria funciona por CLI (`ruflo memory search` encuentra el namespace `flujo`).
- Arreglo oficial: `ruflo policy verify --establish-anchor`, exige terminal interactiva (lo ejecuta Daniel).

### Hecho
- Repositorio `C:\Desarrollo\RufloPortable` clonado de `ruflo-web`; sin remoto.
- `.mcp.json` con ruta relativa; retirados lanzadores con rutas de este PC.
- Estado de política y caché `memory-package.json` fuera de Git (eran de otro equipo).
- `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `scripts/verificar.mjs`, `LEEME.md`.

### Pruebas [O]
| Comando | Resultado |
|---|---|
| `npm ci --no-audit --no-fund` | correcto, 86 s; npm 12 bloqueó 16 scripts de instalación |
| `node scripts/verificar.mjs` con `HOME`/`USERPROFILE` vacíos | `ok:true`, 367 herramientas MCP, `arranques:1` |
| misma orden otra vez | `arranques:2` (persistencia) |
| `claude --version` sin postinstall | falla: binario de relleno |
| `node node_modules/@anthropic-ai/claude-code/install.cjs` + `claude --version` | `2.1.308 (Claude Code)` |

### Limitaciones
- Nada de Docker probado: ni build, ni arranque, ni montaje de solo lectura.
- Imagen base fijada por etiqueta, sin digest.
- La prueba nativa no demuestra el comportamiento en Linux (módulos nativos ausentes en ambos casos).

### Siguiente paso
1. Daniel instala WSL 2 + Docker Desktop (requiere administrador y reinicio).
2. `docker compose build` y `docker compose run --rm agente` dos veces; anotar tamaño de imagen, tiempos y digest.
3. `docker compose run --rm agente claude` → `/login`; probar MCP `ruflo` y Notion dentro del contenedor.

## 29/10/2026 (tarde) — Arquitectura GitHub y arranque opaco 0.3.0

### Decisiones [U]
- Tareas: GitHub Issues + Projects (sustituye a Notion). Repos en una organización nueva.
- La memoria (vault) va en un repo; el agente escribe en la rama `agente` y Daniel fusiona.
- Arranque: una clave abre el cofre, se baja la memoria, menú de proyectos (descargar o crear).

### Hecho
- `scripts/credenciales.mjs` (cofre scrypt + AES-256-GCM), `scripts/menu.mjs`, `scripts/ruflo-mcp.mjs`.
- `preparar.mjs`: cofre → memoria → menú → Claude Code en el proyecto con el MCP de Ruflo y la memoria.
- Un solo volumen `/estado`; `ENTRYPOINT` = arranque. Flujo de GitHub Actions para publicar en GHCR (sin probar).

### Pruebas [O]
- `node --test tests/credenciales.test.mjs`: 5/5.
- e2e con remotos locales y API de GitHub simulada: 13/13 (ver LEEME, «Estado de las pruebas»).
- Fallos encontrados y corregidos: rutas largas de la tienda en Windows (`core.longpaths`), rama `agente` sin
  seguimiento (no recibía `main`), argumentos con espacios partidos al lanzar con `shell` en Windows.

### Pendiente
- Dónde vive el cofre (decisión de Daniel), organización y token reales, Docker, `claude setup-token`.
- Sacar de TuRinconDeLectura las dependencias de IA y el orquestador `flujo`.

### Decisión [U] 29/10/2026
- ~~El cofre se versiona y va dentro de la imagen.~~ Sustituida el mismo día: las credenciales no se suben a
  ninguna parte. Cofre en `~/.nullraptor/` de cada equipo; `*.cifrado` fuera de git y de la imagen; en Docker se
  monta en `/cofre`. Clave mínima de 20 caracteres (6 palabras al azar).

## 29/10/2026 (noche) — Tienda sin IA, cuenta personal y MCP diario (0.4.0)
- Flujo automático movido desde TuRinconDeLectura (`flujo/`, `FLUJO_PROYECTO`); la tienda pasa `npm run check` sin IA.
- [U] Cuenta personal `NullDanosaurio` (no es organización: la API de GitHub lo confirma). `GITHUB_ORG` pasa a opcional.
- [U] Recomendación diaria de 3 servidores MCP con instalación autorizada. Fuente: registro oficial; mcpmarket.com
  descartado por su robots.txt (prohíbe agentes de Claude).
- Pruebas: 16/16 unitarias; exploración real (40 s, 3 recomendaciones coherentes); menú: cancelar no instala,
  «instalar» registra y hace commit, configuración con versión fijada, sin relanzar Claude el mismo día (7/7).
- Fallo encontrado y corregido: el registro exige búsquedas de 3+ caracteres («3d» devolvía 422).

## 29/10/2026 — Rebranding: Ruflo Portable → Nullraptor
- [U] Nombre elegido por Daniel. Repositorio `NullDanosaurio/NullRaptor`, imagen `ghcr.io/nulldanosaurio/nullraptor`,
  carpeta `C:\Desarrollo\Nullraptor`, contenedor en `/nullraptor`, volumen `nullraptor`, banner al arrancar.
- Se mantienen la rama `agente` de la memoria y las variables `AGENTE_*` del cofre (describen el papel, no la marca).
- Corrección 29/10/2026: la cuenta de Daniel es **`NullDanosaurio`**; `NullDano` es otra persona (cuenta de 2019,
  API de GitHub). Repositorio `NullDanosaurio/NullRaptor` (privado), imagen `ghcr.io/nulldanosaurio/nullraptor`.

## 29/10/2026 — Imagen publicada (CI en verde)
- Ejecuciones #7 y #8 de «imagen» en verde: pruebas, build, contenedor arrancado dos veces en Linux con memoria
  persistente (arranques 1 → 2), bóveda clonada en rama `agente`, MCP de Ruflo con 367 herramientas.
- Paquete `ghcr.io/nulldanosaurio/nullraptor` publicado (privado).
- Fallos encontrados por la CI: (1) el enlace `node_modules` del worktree es un symlink en Linux y contaba como
  cambio fuera de alcance; (2) el SDK de MCP solo hereda PATH/HOME, así que Ruflo no recibía sus `CLAUDE_FLOW_*` y
  guardaba la memoria con el motor AgentDB fuera del volumen. Ahora: `CLAUDE_FLOW_MEMORY_PATH=/estado/ruflo/swarm`,
  `CLAUDE_FLOW_DISABLE_BRIDGE=1` (sql.js) y variables pasadas explícitamente. (3) La verificación de memoria era
  laxa; ahora compara el JSON de Ruflo.
