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
