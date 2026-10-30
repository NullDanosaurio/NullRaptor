# Nullraptor — guía para trabajar en este repositorio

Nullraptor es una IA en Docker que corre en cualquier equipo: Claude Code + Codex + un centro de herramientas que
crece. Se lanza una vez y se usa desde el PC o el móvil con una interfaz web (resumen, proyectos, chat con la IA,
herramientas). Los proyectos que abre (p. ej. TuRinconDeLectura) son repositorios aparte y aislados de Nullraptor.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `panel/` | Servidor web sin dependencias (`servidor.mjs`, `lib/`) y la web en `src/` (Vite), construida en `dist/` |
| `scripts/` | Arranque (`preparar.mjs`), configuración de la IA (`ia.mjs`), cofre, menú, MCP, lanzadores de Windows |
| `flujo/` | Flujo automático de tareas en worktrees |
| `config/` | Instrucciones globales de la IA (`claude-global.md`) y MCP base (`mcp.json`) |
| `tests/` | Pruebas (`npm test`) |

## Reglas

- Español en código, comentarios, mensajes y commits.
- Los proyectos no reciben archivos de Nullraptor: la configuración de la IA se pasa desde fuera al abrir cada
  sesión (`scripts/ia.mjs`).
- El servidor del panel no lleva dependencias en tiempo de ejecución; archivos de menos de 500 líneas.
- Tras cada cambio, `npm test`. Nunca credenciales ni `.env` en el repositorio.
- Lo que corre en el contenedor sale de la imagen (`/nullraptor`): un cambio llega con commit en `main`, imagen
  nueva en `ghcr.io/nulldanosaurio/nullraptor` y reinicio desde el PC.
- Historia y decisiones: `LEEME.md` y `docs/registro.md`.
