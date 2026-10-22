# Ruflo + Claude Code + Codex

Entorno local para coordinar el futuro proyecto web. La web todavía no está definida ni desarrollada.

## Versiones instaladas

- Ruflo 3.59.17
- Adaptador Codex de Ruflo 3.0.5
- Claude Code 2.1.308
- Codex: instalación existente, autenticada con ChatGPT.

## Abrir

Desde PowerShell en esta carpeta:

```powershell
.\Abrir-proyecto.cmd claude
.\Abrir-proyecto.cmd codex
.\Abrir-proyecto.cmd estado
.\Abrir-proyecto.cmd diagnostico
```

Claude ya está autenticado con Claude Pro. En el primer arranque interactivo hay que aceptar la confianza de esta carpeta y aprobar el MCP local `ruflo`. El lanzador de Codex pasa explícitamente el servidor local para no depender de la confianza inicial de la carpeta. Los modelos se eligen desde cada cliente; no se fija un modelo antiguo.

El lanzador retira claves API de su propio proceso para que esas claves heredadas no cambien la facturación. No modifica las variables permanentes de Windows. La cuota y las condiciones de cada suscripción siguen aplicándose.

## Configuración

- Claude: `.mcp.json`, `.claude/settings.json`, `CLAUDE.md`.
- Codex: `.codex/config.toml`, `AGENTS.md`, `.agents/skills/`.
- Ruflo: `.claude-flow/config.yaml`.
- Memoria local: `.swarm/memory.db`.
- Máximo inicial: 3 agentes; sin autoescalado.
- Ruflo MCP arranca desde la versión local instalada, sin descargar `latest` en cada conexión.
- No se han instalado mods globales, federación ni servicios cloud adicionales.

## Comprobación

```powershell
node scripts/check-mcp.mjs
.\node_modules\.bin\ruflo.cmd memory retrieve --key setup-test --namespace setup
.\Abrir-proyecto.cmd prueba
```

Verificado el 22/10/2026: MCP conectado con 367 herramientas; escritura y recuperación de memoria; inferencia real con ambas suscripciones; coordinador de Ruflo lanzando ambos clientes en paralelo y recogiendo sus respuestas (EQUIPO_OK). Evidencia en `docs/prueba-equipo.json`. La prueba no implementa software ni demuestra aún un ciclo de desarrollo, revisión y correcciones completo.

`scripts/prueba-equipo.mjs` adapta el lanzamiento de comandos de memoria a Windows mediante Node y la instalación local fijada, evitando la descarga de `ruflo@latest`. Es una prueba acotada de arranque y recogida de resultados, no el flujo de producción de la futura web.

## Primera tarea después del acceso

Pedir al coordinador una prueba pequeña y verificable antes del proyecto web: un agente implementa una función acotada y otro la revisa. Cada escritor debe tener su propio worktree; solo el integrador modifica manifiestos y dependencias. No activar bucles infinitos ni dar por completada una tarea solo porque Ruflo haya registrado un agente.

Antes de construir la web, definir el alcance, las pantallas, los datos reales, los criterios de aceptación y las integraciones. La configuración por sí sola no ejecuta automáticamente una web de principio a fin.
