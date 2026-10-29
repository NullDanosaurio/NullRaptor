# Registro de trabajo

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
- El cofre `credenciales.cifrado` se versiona y va dentro de la imagen. Clave mínima subida a 20 caracteres (6 palabras al azar).

## 29/10/2026 (noche) — Tienda sin IA, cuenta personal y MCP diario (0.4.0)
- Flujo automático movido desde TuRinconDeLectura (`flujo/`, `FLUJO_PROYECTO`); la tienda pasa `npm run check` sin IA.
- [U] Cuenta personal `NullDano` (no es organización: la API de GitHub lo confirma). `GITHUB_ORG` pasa a opcional.
- [U] Recomendación diaria de 3 servidores MCP con instalación autorizada. Fuente: registro oficial; mcpmarket.com
  descartado por su robots.txt (prohíbe agentes de Claude).
- Pruebas: 16/16 unitarias; exploración real (40 s, 3 recomendaciones coherentes); menú: cancelar no instala,
  «instalar» registra y hace commit, configuración con versión fijada, sin relanzar Claude el mismo día (7/7).
- Fallo encontrado y corregido: el registro exige búsquedas de 3+ caracteres («3d» devolvía 422).

## 29/10/2026 — Rebranding: Ruflo Portable → Nullraptor
- [U] Nombre elegido por Daniel. Repositorio `NullDano/Nullraptor`, imagen `ghcr.io/nulldano/nullraptor`,
  carpeta `C:\Desarrollo\Nullraptor`, contenedor en `/nullraptor`, volumen `nullraptor`, banner al arrancar.
- Se mantienen la rama `agente` de la memoria y las variables `AGENTE_*` del cofre (describen el papel, no la marca).
