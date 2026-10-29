# Ruflo Portable 0.3.0

Agente personal portátil: Ruflo + Claude Code en un contenedor. Arranca con **una clave**, descarga su memoria
(vault de Obsidian en GitHub) y muestra un menú con los proyectos que conoce: si el elegido no está en el equipo
lo descarga, y si es nuevo crea su repositorio privado en la organización y lo registra en la memoria.

Procedencia: [O] observado · [P] propuesta · [?] pendiente.

## Arquitectura (decidida el 29/10/2026)

| Pieza | Dónde | Notas |
|---|---|---|
| Agente (este repo) | GitHub, organización propia; imagen en `ghcr.io/<org>/agente` | Sin credenciales dentro |
| Memoria | Repo privado con el vault de Obsidian | El agente escribe solo en la rama `agente`; Daniel fusiona en `main` |
| Proyectos | Un repo privado cada uno | Deben funcionar sin IA: el agente no deja archivos suyos en ellos |
| Tareas | GitHub Issues + Projects | Etiqueta `agente` para las tareas del agente. Sustituye a Notion |

## Arranque en cualquier equipo con Docker

```powershell
docker run -it --rm -v agente:/estado ghcr.io/<org>/agente
```

Pide la clave, actualiza la memoria y muestra el menú. Elegido el proyecto, abre Claude Code dentro de él con
la memoria accesible y el MCP de Ruflo. Todo lo del equipo queda en el volumen `agente` (`/estado`).

Otros modos: `... ghcr.io/<org>/agente claude` (orden concreta en `/agente`); sin terminal, ejecuta la verificación.
En un servidor sin terminal, la clave puede pasarse en `AGENTE_CLAVE`.

## Cofre de credenciales

Un archivo `credenciales.cifrado` (scrypt + AES-256-GCM, solo con `node:crypto`) con, en formato `NOMBRE=valor`:

| Variable | Qué es |
|---|---|
| `MEMORIA_REPO` | URL del repo de la memoria |
| `GITHUB_ORG` | Organización donde se crean los proyectos |
| `GITHUB_TOKEN` | Token *fine-grained* de la organización: Contents RW, Administration RW (crear repos), Metadata R |
| `CLAUDE_CODE_OAUTH_TOKEN` | De `claude setup-token` (suscripción de Claude, larga duración) |
| `AGENTE_GIT_NOMBRE`, `AGENTE_GIT_EMAIL` | Autor de los commits del agente |

Crear o renovar: escribir esas líneas en `.env.credenciales` (no se versiona), ejecutar
`node scripts/credenciales.mjs crear .env.credenciales credenciales.cifrado` y **borrar** `.env.credenciales`.
`listar` muestra los nombres guardados, nunca los valores.

**Decisión [U] 29/10/2026: el cofre se versiona y viaja dentro de la imagen** para arrancar con una sola orden y la
clave. Consecuencia: cualquiera con la imagen puede intentar adivinar la clave sin conexión. Por eso:
- clave de al menos 20 caracteres; usar **6 palabras al azar** (no frases conocidas ni reutilizadas);
- tokens con el mínimo permiso (solo la organización) y con caducidad; renovarlos rehaciendo el cofre;
- si se sospecha que la clave se ha filtrado: revocar los tokens en GitHub y en Claude, y crear un cofre nuevo.

Los tokens solo existen en la memoria de los procesos: git los recibe por variables de entorno (ni en disco ni en
`.git/config`) y la clave no pasa a los procesos hijos.

## Desarrollo del agente

```powershell
npm ci --ignore-scripts; node node_modules/@anthropic-ai/claude-code/install.cjs
npm test
docker compose run --rm agente        # construye desde este repo
```

`--ignore-scripts`: npm 12 bloquea los scripts de instalación y Ruflo funciona sin sus módulos nativos. Claude
Code sí necesita el suyo (`install.cjs`), que solo coloca el binario de la plataforma.

Piezas: `scripts/preparar.mjs` (arranque), `scripts/credenciales.mjs` (cofre), `scripts/menu.mjs` (proyectos),
`scripts/ruflo-mcp.mjs` (MCP con raíz en `/agente`), `scripts/verificar.mjs` (comprobación),
`.github/workflows/imagen.yml` (publica la imagen).

## Estado de las pruebas (29/10/2026)

| Prueba | Resultado |
|---|---|
| Instalación limpia desde lockfile (npm 12, `HOME` vacío) | [O] correcta |
| MCP de Ruflo: 367 herramientas; memoria persistente entre arranques | [O] |
| Cofre: abre con la clave, rechaza clave errónea y archivo alterado; la clave no llega a los hijos | [O] 5 pruebas unitarias + e2e |
| Memoria: clon, rama `agente`, recibe fusiones de `main`, conserva commits propios si diverge | [O] |
| Menú: descarga un proyecto conocido; crea uno nuevo (API simulada), nota en la memoria y rama subida | [O] e2e con GitHub falso |
| MCP lanzado dentro de un proyecto no deja archivos en él | [O] |
| API real de GitHub, organización y token | [?] falta la organización |
| Construir y arrancar la imagen; publicar en GHCR | [?] Docker no instalado |
| `claude setup-token` dentro del contenedor | [?] requiere a Daniel |
| Otro equipo | [?] pendiente |

Registro: `docs/registro.md`.
