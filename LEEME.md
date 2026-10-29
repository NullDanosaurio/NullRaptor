# Nullraptor 0.4.0

> Velocirráptor listo y rápido que caza en manada: tu agente personal, con su memoria a cuestas.
> Antes «Ruflo Portable» (renombrado el 29/10/2026).

Agente personal portátil: Ruflo + Claude Code en un contenedor. Arranca con **una clave**, descarga su memoria
(vault de Obsidian en GitHub) y muestra un menú con los proyectos que conoce: si el elegido no está en el equipo
lo descarga, y si es nuevo crea su repositorio privado y lo registra en la memoria. Una vez al día recomienda 3
servidores MCP, que solo se instalan con autorización.

Procedencia: [O] observado · [P] propuesta · [?] pendiente.

## Arquitectura (decidida el 29/10/2026)

| Pieza | Dónde | Notas |
|---|---|---|
| Agente (este repo) | GitHub, cuenta personal `NullDanosaurio`; imagen en `ghcr.io/nulldanosaurio/nullraptor` | Sin credenciales dentro |
| Memoria | Repo privado con el vault de Obsidian | El agente escribe solo en la rama `agente`; Daniel fusiona en `main` |
| Proyectos | Un repo privado cada uno | Deben funcionar sin IA: el agente no deja archivos suyos en ellos |
| Tareas | GitHub Issues + Projects | Etiqueta `agente` para las tareas del agente. Sustituye a Notion |

## Arranque en Windows sin Docker (doble clic)

`Nullraptor.cmd` (o un acceso directo a él en el escritorio). Necesita Node 24, git y `npm ci` hecho en esta
carpeta, y el cofre en `~/.nullraptor/`. La clave se pide **solo la primera vez** en cada equipo: se recuerda en
`%LOCALAPPDATA%\Nullraptor\clave.dpapi`, cifrada con DPAPI (solo tu usuario de Windows en ese equipo puede leerla;
no se sube a ninguna parte). Si deja de abrir el cofre, se olvida y se vuelve a pedir. Para olvidarla a mano,
borra ese archivo. Contrapartida: quien entre en tu sesión de Windows puede abrir el agente sin la clave.

**Equipo nuevo desde el USB:** doble clic en `Instalar Nullraptor.cmd` (raíz del USB), que ejecuta
`Nullraptor\instalar.ps1`, copia de `scripts/instalar.ps1`. Instala git y Node con winget si faltan, copia el
cofre del USB a `~/.nullraptor/` (si ya hay uno distinto, pregunta), clona o actualiza el agente en
`%USERPROFILE%\nullraptor-trabajo\agente`, hace `npm ci`, crea el acceso directo y lo arranca. Al terminar refresca
la copia del USB. El `.cmd` es una línea:
`powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Nullraptor\instalar.ps1"`.

## Arranque en cualquier equipo con Docker

```powershell
docker run -it --rm -v nullraptor:/estado -v "$HOME\.nullraptor:/cofre:ro" ghcr.io/nulldanosaurio/nullraptor
```

`$HOME\.nullraptor` es la carpeta del equipo con `credenciales.cifrado`; el contenedor la ve en solo lectura.

Pide la clave, actualiza la memoria y muestra el menú. Elegido el proyecto, abre Claude Code dentro de él con
la memoria accesible y el MCP de Ruflo. Todo lo del equipo queda en el volumen `nullraptor` (`/estado`).

Otros modos: `... ghcr.io/nulldanosaurio/nullraptor claude` (orden concreta en `/nullraptor`); sin terminal, ejecuta la verificación.
En un servidor sin terminal, la clave puede pasarse en `AGENTE_CLAVE`.

## Cofre de credenciales

Un archivo `credenciales.cifrado` (scrypt + AES-256-GCM, solo con `node:crypto`) con, en formato `NOMBRE=valor`:

| Variable | Qué es |
|---|---|
| `MEMORIA_REPO` | URL del repo de la memoria |
| `GITHUB_ORG` | Opcional. Sin ella, los proyectos se crean en la cuenta personal del token (decisión 29/10: `NullDanosaurio`) |
| `GITHUB_TOKEN` | Token *fine-grained* de `NullDanosaurio`, todos los repositorios: Contents RW, Administration RW (crear repos), Metadata R; con caducidad |
| `CLAUDE_CODE_OAUTH_TOKEN` | De `claude setup-token` (suscripción de Claude, larga duración). Si el equipo ya tiene sesión (`/login`; en Docker se guarda en el volumen), Claude Code usa la sesión y no el token, porque con el token no se cargan los conectores de claude.ai (MCP conectados desde el navegador) |
| `AGENTE_GIT_NOMBRE`, `AGENTE_GIT_EMAIL` | Autor de los commits del agente |

Crear o renovar: escribir esas líneas en `.env.credenciales` (no se versiona), ejecutar
`node scripts/credenciales.mjs crear .env.credenciales $HOME\.nullraptor\credenciales.cifrado` y **borrar**
`.env.credenciales`. `listar` muestra los nombres guardados, nunca los valores.

**Decisión [U] 29/10/2026: las credenciales no se suben a ninguna parte.** El cofre vive solo en cada equipo, en
`~/.nullraptor/credenciales.cifrado` (otra ruta: variable `CREDENCIALES`). `*.cifrado` está excluido de git y de la
imagen; en Docker se monta en `/cofre`. Para otro equipo: llevarlo a mano (p. ej. USB) o crear allí uno nuevo.
La imagen no contiene secretos. Aun así:
- clave de al menos 20 caracteres; usar **6 palabras al azar** (no frases conocidas ni reutilizadas);
- tokens con el mínimo permiso y con caducidad; renovarlos rehaciendo el cofre;
- si se sospecha que la clave se ha filtrado: revocar los tokens en GitHub y en Claude, y crear un cofre nuevo.

Los tokens solo existen en la memoria de los procesos: git los recibe por variables de entorno (ni en disco ni en
`.git/config`) y la clave no pasa a los procesos hijos.

## Servidores MCP: recomendación diaria e instalación con autorización

- **Fuente**: registro oficial (`registry.modelcontextprotocol.io`), API pública pensada para uso automático.
  mcpmarket.com **no**: su `robots.txt` prohíbe el acceso a los agentes de Claude.
- **Hueco diario**: al arrancar en modo interactivo, si hoy no se ha hecho, busca por temas de nuestro trabajo
  (`INTERESES` en `scripts/mcp.mjs`) y novedades desde la última vez. Claude, **sin herramientas ni red**, elige 3
  (al menos uno útil; uno chulo o divertido si lo hay) con el contexto de `Proyectos/` de la memoria. Se validan
  los ids contra la lista. Si algo falla, el arranque sigue sin recomendaciones.
- **Dónde queda**: `MCP/Recomendaciones/AAAA-MM-DD.md` y `MCP/estado.json` en la memoria (rama `agente`).
  No se repiten recomendaciones.
- **Instalar**: menú → `m` → ver detalles (paquete y versión, repositorio, variables, riesgos) → escribir
  `instalar`. Solo se admiten paquetes npm con versión exacta (`npx -y paquete@x.y.z`) o remotos `https`
  (si piden una cabecera como `x-api-key`, su valor va al cofre como `MCP_<ID>_<CABECERA>`, p. ej.
  `MCP_DEV_21ST_MCP_X_API_KEY`; cabeceras con plantilla tipo `Bearer {x}` aún no); pypi/docker aún no. Las variables secretas van al cofre; si falta una obligatoria, el servidor no se
  activa. Se aplican al abrir un proyecto.
- **Buscar por descripción** (menú → `b`): describes en español lo que necesitas; Claude (sin herramientas) saca de
  1 a 6 términos en inglés, se busca en el registro y Claude devuelve **de 0 a 3** que de verdad encajen (si nada
  sirve, lo dice). Se instalan igual que los del día. Ejemplo real: «calendario y recordatorios» → 3 servidores de
  calendario; «vigilar mi impresora Elegoo» → ninguno instalable hoy.
- A mano: `node scripts/preparar.mjs node scripts/mcp.mjs explorar [--forzar]`.

## Chat con Claude y Codex a la vez

Tras elegir proyecto: `c` en vez de Intro (`scripts/chat.mjs`). Sin destinatario contestan las dos, alternando quién
empieza, y cada una lee lo que dijo la otra; `@claude …` o `@codex …` habla con una; `/fin` cierra. Las dos **solo
leen** el proyecto (los cambios, por el flujo automático). Decisión [U] 29/10/2026: la bóveda es conocimiento, no un
registro de chats → la conversación completa queda solo en el equipo (`$TRABAJO_DIR/chats`, se borra a los 30 días) y
al cerrar Claude escribe en `Diario/AAAA-MM-DD.md` de la memoria un resumen de 2-5 viñetas; si ve una lección
reutilizable la propone, pero no la guarda sola. Cada mensaje a las dos gasta cuota de ambas suscripciones.

## Flujo automático sobre un proyecto

Movido desde la tienda el 29/10/2026 (los proyectos ya no llevan IA). Codex implementa en un worktree del proyecto,
el coordinador comprueba integridad, typecheck, unitarias, build y e2e, Claude revisa en solo lectura y, si todo
pasa, hace commit y avance rápido de `main` (nunca push).

```powershell
$env:FLUJO_PROYECTO = 'C:\ruta\al\proyecto'    # o ejecutar desde la carpeta del proyecto
npm run flujo -- estado | plan | tarea tareas\<archivo>.md | cancelar | recuperar
npm run monitor                                 # panel en vivo (q para salir)
```

**Turnos** (para que Codex avance mientras Claude está ocupado):

```powershell
npm run flujo -- plan --turno-codex   # Codex implementa + comprobaciones; deja «listo para revisar» (main intacto)
npm run flujo -- revisar [Id]         # turno de Claude: comprobaciones sobre el main actual, revisión, integración
```

Si Claude rechaza, su diagnóstico se guarda y Codex lo recibe en su siguiente turno. Requiere `main` limpio al
empezar (no trabajar a la vez en la misma carpeta del proyecto). Codex usa la cuota de la suscripción de ChatGPT.

Las tareas, sus pruebas y los registros (`.runs/`, `.worktrees/`, fuera de git) viven en el proyecto; Claude,
Ruflo y su memoria, en el agente. Las comprobaciones son las de un proyecto Next.js + TypeScript + Playwright
(la tienda); habrá que generalizarlas con el segundo tipo de proyecto. Codex no va en la imagen todavía.

## Desarrollo del agente

```powershell
npm ci --ignore-scripts; node node_modules/@anthropic-ai/claude-code/install.cjs
npm test
docker compose run --rm nullraptor        # construye desde este repo
```

`--ignore-scripts`: npm 12 bloquea los scripts de instalación y Ruflo funciona sin sus módulos nativos. Claude
Code sí necesita el suyo (`install.cjs`), que solo coloca el binario de la plataforma.

Piezas: `scripts/preparar.mjs` (arranque), `scripts/credenciales.mjs` (cofre), `scripts/menu.mjs` (proyectos),
`scripts/ruflo-mcp.mjs` (MCP con raíz en `/nullraptor`), `scripts/verificar.mjs` (comprobación),
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
| Construir la imagen y arrancarla con el cofre (Docker 29.9.2 en Windows) | [O] |
| Publicar en GHCR (workflow `imagen`) | [O] |
| `claude setup-token` dentro del contenedor | [?] requiere a Daniel |
| Otro equipo | [?] pendiente |

Registro: `docs/registro.md`.
