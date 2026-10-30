# Nullraptor 0.4.0

> Velocirráptor listo y rápido que caza en manada: tu agente personal, con su memoria a cuestas.
> Antes «Ruflo Portable» (renombrado el 29/10/2026).

Agente personal portátil: Claude Code + Codex en un contenedor, con Ruflo como herramienta (MCP). Arranca con **una clave**, descarga su memoria
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

## Arranque en Windows (doble clic, siempre en Docker)

Decisión [U] 29/10/2026: Nullraptor **nunca corre sobre el sistema**, solo en Docker, para que funcione igual en
cualquier equipo con Docker. Flujo: lanzador → Docker (se instala y arranca si hace falta) → imagen de GitHub
(`ghcr.io/nulldanosaurio/nullraptor:main`) → contenedor con el servidor y el panel → navegador en
`http://localhost:4321`. El contenedor (`nullraptor`) sigue en marcha al cerrar la ventana; si ya lo está, el
lanzador solo abre el navegador. Pararlo: `docker stop nullraptor`.

**Equipo nuevo desde el USB:** doble clic en `Instalar Nullraptor.cmd` (raíz del USB), que ejecuta
`Nullraptor\instalar.ps1`, copia de `scripts/instalar.ps1`. Instala Docker Desktop con winget si falta (pide
administrador; si Windows pide reiniciar por WSL 2, reinicia y repite) y lo arranca, copia el cofre del USB a
`~/.nullraptor/` (si ya hay uno distinto, pregunta), descarga la imagen (si el registro pide sesión, la pide una
vez: usuario de GitHub y token clásico con `read:packages`), deja el lanzador en `%LOCALAPPDATA%\Nullraptor`
(sacado de la imagen), crea el acceso directo y arranca. Al terminar refresca la copia del USB desde la imagen.

**Lanzador** (`scripts/arrancar.ps1`; acceso directo «Nullraptor» o `Nullraptor.cmd` en el repo): actualiza la
imagen (sin red, usa la que haya), prueba la clave con un contenedor de un solo uso y levanta el panel. La clave se
pide **solo la primera vez** en cada equipo: se recuerda en `%LOCALAPPDATA%\Nullraptor\clave.dpapi`, cifrada con
DPAPI (solo tu usuario de Windows en ese equipo puede leerla). Si deja de abrir el cofre, se olvida y se vuelve a
pedir. Contrapartidas: quien entre en tu sesión de Windows puede abrir el agente sin la clave, y la clave va en
`AGENTE_CLAVE` del contenedor mientras está en marcha (`docker inspect` la muestra a quien controle Docker en el
equipo). Otra imagen: variable `NULLRAPTOR_IMAGEN` (p. ej. `nullraptor:dev`).

**Red de casa** (lanzador con `-Red`, se recuerda; `-SoloEquipo` lo quita; el instalador lo pregunta): el panel
se publica en todas las interfaces y el lanzador muestra las direcciones (`http://<IP>:4321`) y el **código de
acceso**. Cada navegador lo escribe una vez en `/entrar` y queda con una cookie de sesión (HttpOnly, SameSite=Strict,
30 días); este equipo entra solo. Solo se aceptan Host de casa (IP privada o nombre del equipo) y, como mucho, 10
códigos fallidos por minuto. El código vive en el volumen (`/estado/home/.nullraptor/panel-codigo`): borrarlo y
reiniciar cierra todas las sesiones. Abre una regla del firewall de Windows solo para redes **privadas** (si tu
Wi-Fi está como pública en Windows, no llegará). Sin HTTPS: úsalo solo en tu red de confianza, no en Wi-Fi públicas;
ojo con VPN tipo ZeroTier, cuyos miembros también son «red privada».

**Desde cualquier parte: Tailscale + passkey** (lanzador con `-Tailscale`, se recuerda; `-SinTailscale` lo quita).
Antes, una vez: instala Tailscale en el PC y en el móvil con la misma cuenta y activa MagicDNS y los certificados
HTTPS en https://login.tailscale.com/admin/dns. El lanzador ejecuta `tailscale serve` (nunca Funnel): el panel sigue
publicado solo en `127.0.0.1` y Tailscale lo sirve por HTTPS en `https://<pc>.<tailnet>.ts.net` únicamente a tus
dispositivos; no se abre ningún puerto del router. Todo lo que llega por ese dominio exige **passkey** (huella, cara
o PIN; `panel/lib/passkey.mjs`, WebAuthn sin dependencias): la primera se crea en `/entrar` con el código que
muestra el lanzador; las siguientes, con un código de un solo uso (10 min, QR) que se saca en Remoto → Seguridad
desde un dispositivo que ya tenga passkey. Sesión en cookie `__Host-` (Secure, HttpOnly, SameSite=Strict) de 12 h
como mucho y 2 h sin uso; abrir o usar la terminal y gestionar passkeys piden confirmar la passkey cada hora. Las
escrituras exigen Origin exacto (`https://<dominio>`) y `X-Nullraptor`; 10 fallos por minuto como mucho. Desde
este equipo (`localhost`) todo sigue sin passkey. **Registro** en el volumen: `$TRABAJO_DIR/registros/accesos.jsonl`
(entradas, fallos, altas) y `registros/terminal/` (cada sesión entera: lo que entra y lo que sale). **Aviso al
móvil** opcional: `AVISO_NTFY` en el cofre con la URL de un tema de ntfy (p. ej. `https://ntfy.sh/<tema-largo-y-raro>`)
avisa de cada entrada, passkey nueva y terminal abierta. ¿Perdiste todas las passkeys? Borra
`/estado/home/.nullraptor/passkeys.json` desde el PC (`docker exec nullraptor rm …`) y da de alta otra con el código.
Límite: quien tenga tu móvil desbloqueado y la passkey entra, y dentro del contenedor tiene lo mismo que Claude
(incluidos sus tokens); el contenedor lo separa de Windows.

**Proyectos:** el menú y el panel muestran primero **Nullraptor** (el propio agente, descargado en el primer
arranque) y la **Bóveda** (se trabaja sobre la memoria, rama `agente`), y después el resto de la memoria.

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

## Panel web: chat, trabajo y bóveda en un solo sitio

`panel/` (añadido el 29/10/2026). Servidor Node sin dependencias (`panel/servidor.mjs`) + web React/Vite/Tailwind
(`panel/src`, diseño a partir de componentes de 21st.dev Magic). Secciones: **Inicio** (proyectos, flujo en curso,
últimos cambios de la bóveda, MCP del día, chats), **Chat** (el mismo de `chat.mjs`: Claude y Codex en solo lectura,
«Terminar y resumir» escribe en el Diario), **Trabajo** (tareas y fases del flujo en vivo, commits), **Bóveda**
(árbol, búsqueda, notas con `[[enlaces]]` y retroenlaces; solo lectura) y **Remoto**.

**Remoto** (`panel/lib/remoto.mjs`, `pty.mjs`): «Abrir sesión» lanza `claude --remote-control --permission-mode
manual` en `$TRABAJO_DIR/proyectos/<P>` dentro de una terminal real (`script`, sin módulos nativos) con el entorno de
`preparar.mjs` (tokens y `BOVEDA_DIR`, nunca `AGENTE_CLAVE`). Se ve y se maneja en la terminal del panel (xterm.js,
con teclas Esc/Tab/flechas/Ctrl+C para el móvil) y a la vez desde claude.ai/code o la app (enlace y QR). Solo
Claude Code, nunca una shell: pregunta antes de cada acción y unas reglas `deny` (`--settings`) le impiden leer o
editar el cofre, `~/.nullraptor` (código y passkeys), las credenciales y `.claude.json` de Claude y los registros.
Las reglas de `Bash` son orientativas (una orden se puede disfrazar); lo que protege es que pregunte siempre.
Marca la carpeta como de confianza en `.claude.json`. Una sesión por proyecto, 3 como mucho, se cierran solas a
las 4 h y todas al parar el panel. Con la red de casa y solo el código (`-Red`) la terminal no se usa.

```powershell
docker run -it --rm -p 127.0.0.1:4321:4321 -v nullraptor:/estado -v "$HOME\.nullraptor:/cofre:ro" ghcr.io/nulldanosaurio/nullraptor node panel/servidor.mjs
npm run panel:construir; npm run panel     # sin Docker (la primera vez construye la web en panel/dist)
```

Abre `http://localhost:4321`. Seguridad: solo `localhost` (rechaza otro `Host`), las escrituras exigen la cabecera
`X-Nullraptor` y misma procedencia, y las rutas de la bóveda y los chats no pueden salir de su carpeta.
Desarrollo de la web: `npm run dev --prefix panel` con el servidor en marcha (proxy de `/api`).

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

Nada del flujo vive en el proyecto: las tareas están en la bóveda (`Proyectos/<proyecto>/Tareas`) y los registros y
worktrees en `$TRABAJO_DIR/flujo/<proyecto>` (en Linux, node_modules entra en el worktree con enlaces duros); Claude,
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
