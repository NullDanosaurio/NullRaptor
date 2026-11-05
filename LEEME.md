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
(`ghcr.io/nulldanosaurio/nullraptor:main`) → contenedor con el servidor y el panel → el panel en **su propia ventana**,
como una aplicación (`http://localhost:4321` en Edge o Chrome en modo app: sin pestañas ni barra de direcciones, con
el icono del raptor y un perfil aparte en `%LOCALAPPDATA%\Nullraptor\ventana`; sin ninguno de los dos, el navegador
de siempre). En el móvil, «Añadir a pantalla de inicio» lo abre igual, a pantalla completa (`manifest.webmanifest`).
El contenedor (`nullraptor`) sigue en marcha al cerrar la ventana; si ya lo está, el lanzador solo la abre.
Pararlo: `docker stop nullraptor`.

**Equipo nuevo desde el USB:** doble clic en `Instalar Nullraptor.cmd` (raíz del USB), que ejecuta
`Nullraptor\instalar.ps1`, copia de `scripts/instalar.ps1`. Instala Docker Desktop con winget si falta (pide
administrador; si Windows pide reiniciar por WSL 2, reinicia y repite) y lo arranca, copia el cofre del USB a
`~/.nullraptor/` (si ya hay uno distinto, pregunta), descarga la imagen (si el registro pide sesión, la pide una
vez: usuario de GitHub y token clásico con `read:packages`), deja el lanzador en `%LOCALAPPDATA%\Nullraptor`
(sacado de la imagen), crea el acceso directo (con el icono del raptor) y arranca. Al terminar refresca la copia del USB desde la imagen.

**Lanzador** (`scripts/arrancar.ps1`; acceso directo «Nullraptor» o `Nullraptor.cmd` en el repo): **doble clic, sin
opciones** (fase 5, 02/11/2026). Actualiza la
imagen (sin red, usa la que haya), prueba la clave con un contenedor de un solo uso y levanta el panel. La clave se
pide **solo la primera vez** en cada equipo: se recuerda en `%LOCALAPPDATA%\Nullraptor\clave.dpapi`, cifrada con
DPAPI (solo tu usuario de Windows en ese equipo puede leerla). Si deja de abrir el cofre, se olvida y se vuelve a
pedir. Contrapartidas: quien entre en tu sesión de Windows puede abrir el agente sin la clave, y la clave va en
`AGENTE_CLAVE` del contenedor mientras está en marcha (`docker inspect` la muestra a quien controle Docker en el
equipo). Otra imagen: variable `NULLRAPTOR_IMAGEN` (p. ej. `nullraptor:dev`).

**Actualización automática** (decisión [U] 31/10/2026): cada cambio en `main` genera una imagen nueva (CI) y el
equipo la instala solo. La copia instalada del lanzador registra la tarea programada «Nullraptor (actualizar)» (de
tu usuario, sin administrador), que cada 5 minutos ejecuta `arrancar.ps1 -Actualizar` sin ventana: baja la imagen y,
si es nueva, recrea el contenedor con los mismos ajustes (red, Tailscale, carpetas y la clave recordada) **solo si no
hay sesiones de Claude ni chats abiertos**. Si los hay, el panel muestra «Hay una versión nueva» con el botón
«Actualizar ahora», que la instala en la siguiente pasada aunque haya sesiones (se cierran y se reabren solas: ver
«Reinicios sin perder el trabajo»). Si el contenedor está
parado, no lo arranca. Se hablan por archivos del volumen (`$TRABAJO_DIR/actualizacion`: `panel.json`,
`disponible.json`, `solicitada.json`; `panel/lib/actualizacion.mjs`). Registro en
`%LOCALAPPDATA%\Nullraptor\actualizar.log`. `-SinActualizar` quita la tarea (se recuerda; `-ConActualizar` la vuelve a
poner). La tarea se crea la primera vez que se abre el lanzador ya actualizado.

**Acceso y carpetas desde Ajustes** (decisión [U] 02/11/2026): la red de casa, Tailscale y las carpetas de Windows
que ve la IA (cada una, con lectura y escritura, en `/pc/<nombre>`) se cambian en el panel → Ajustes, desde este equipo o por Tailscale con la passkey confirmada (con solo
el código de casa, no). El contenedor no toca Windows: el panel deja el pedido en `$TRABAJO_DIR/equipo/pedido.json`
(`panel/lib/equipo.mjs`) y el lanzador lo aplica al abrirlo o en su tarea de cada 5 minutos, cuando no hay sesiones
abiertas (o en seguida con «Aplicar ahora», que las cierra). Todo o nada: si una carpeta no existe, contiene el cofre o
la clave, o Tailscale no está listo, no cambia nada y Ajustes enseña el motivo (`resultado.json`). Cada pedido queda en
el registro de accesos y avisa por ntfy. La regla del firewall (red de casa) pide administrador: la tarea no puede, así
que la crea el siguiente arranque a mano. **Rescate** si el panel no responde: lanzador con `-SoloEquipo`,
`-SinTailscale` o `-SinCarpetas` (y siguen `-Red`, `-Tailscale` y `-Carpeta 'C:\ruta'`).

**Red de casa** (Ajustes → «Red de casa»): el panel
se publica en todas las interfaces y el lanzador muestra las direcciones (`http://<IP>:4321`) y el **código de
acceso**. Cada navegador lo escribe una vez en `/entrar` y queda con una cookie de sesión (HttpOnly, SameSite=Strict,
30 días); este equipo entra solo. Solo se aceptan Host de casa (IP privada o nombre del equipo) y, como mucho, 10
códigos fallidos por minuto. El código vive en el volumen (`/estado/home/.nullraptor/panel-codigo`): borrarlo y
reiniciar cierra todas las sesiones. Abre una regla del firewall de Windows solo para redes **privadas** (si tu
Wi-Fi está como pública en Windows, no llegará). Sin HTTPS: úsalo solo en tu red de confianza, no en Wi-Fi públicas;
ojo con VPN tipo ZeroTier, cuyos miembros también son «red privada».

**Desde cualquier parte: Tailscale + passkey** (Ajustes → «Desde cualquier parte»).
Antes, una vez: instala Tailscale en el PC y en el móvil con la misma cuenta y activa MagicDNS y los certificados
HTTPS en https://login.tailscale.com/admin/dns. El lanzador ejecuta `tailscale serve` (nunca Funnel): el panel sigue
publicado solo en `127.0.0.1` y Tailscale lo sirve por HTTPS en `https://<pc>.<tailnet>.ts.net` únicamente a tus
dispositivos; no se abre ningún puerto del router. Todo lo que llega por ese dominio exige **passkey** (huella, cara
o PIN; `panel/lib/passkey.mjs`, WebAuthn sin dependencias): la primera se crea en `/entrar` con el código que
muestra el lanzador; las siguientes, con un código de un solo uso (10 min, QR) que se saca en Ajustes → Passkeys
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

**Reinicios sin perder el trabajo** (02/11/2026): antes de recrear el contenedor, el lanzador lo para con
`docker stop -t 30`; `preparar.mjs` (PID 1) pasa la señal al panel, que apunta los proyectos con sesión abierta en
`$TRABAJO_DIR/actualizacion/reanudar.json` y las cierra. Al volver (antes de 30 minutos), las reabre con
`claude --continue` y un primer mensaje que le pide revisar sus tareas y seguir con la pendiente (o esperar si no
había nada). En el panel, «Continuar la anterior» hace lo mismo a mano. Las tareas y el estado de Ruflo
(`.claude-flow/tasks`, `agents`, `sessions`, `memory`…) se enlazan a `/estado/ruflo`: antes vivían en la imagen
y se perdían en cada actualización.

**Instalar programas** (decisiones [U] 02/11/2026): la imagen trae curl, unzip, Python 3 (pip, venv),
build-essential y libGL/EGL/X11 (CAD con build123d, programas gráficos sin pantalla). `NPM_CONFIG_PREFIX` y
`PYTHONUSERBASE` apuntan a `/estado/sistema` (en el PATH), así que `npm install -g`, `pip install` y los binarios
sueltos en `/estado/sistema/bin` sobreviven a las actualizaciones. Hay **sudo sin contraseña**; `paquetes instalar
<nombre…>` (`scripts/paquetes.mjs`) instala con apt y lo apunta en `/estado/sistema/apt-paquetes.txt`, y al
arrancar se reinstala en segundo plano lo que falte (registro en `/estado/sistema/apt.log`).

**Puente con el PC** (decisiones [U] 02/11/2026: primero lista blanca; después **control completo**, «que la IA
pueda usar un equipo completamente funcional como lo haría un humano»): el lanzador arranca `scripts/puente.ps1`
en segundo plano (sin ventana ni administrador, como tu usuario de Windows), que escucha en `127.0.0.1:4329`
(`NULLRAPTOR_PUERTO_PUENTE`) con un token de `%LOCALAPPDATA%\Nullraptor\puente.token`. El contenedor recibe
`NULLRAPTOR_PUENTE` (`host.docker.internal:4329`) y `NULLRAPTOR_PUENTE_TOKEN`, y la IA usa
`node /nullraptor/scripts/pc.mjs <orden>`:

| Modo | Órdenes |
|---|---|
| consulta y completo | `estado`, `sistema`, `procesos`, `puertos`, `programas`, `winget-buscar`, `abrir-url`, `notificar` |
| solo completo (por defecto) | `ejecutar` (PowerShell libre, proceso aparte, hasta 30 min), `iniciar` (programa con ventana), `enviar` / `traer` (archivos por trozos, sin límite práctico, comprobados con SHA-256), `ventanas`, `enfocar`, `captura` (PNG), `raton`, `teclado` |

La aprobación de cada orden la da Claude Code: las sesiones del panel van en modo `manual` y preguntan antes de cada
orden. Riesgo aceptado: en modo completo la IA puede leer cualquier archivo de tu usuario, también la clave recordada
del cofre (`clave.dpapi`); las instrucciones le prohíben tocar `%LOCALAPPDATA%\Nullraptor` y `~\.nullraptor`.
**Corte inmediato**: `arrancar.ps1 -PuenteConsulta` (crea `puente-consulta`; se mira en cada petición y en consulta
la IA no puede ejecutar nada para quitarlo); `-PuenteCompleto` lo devuelve. Una orden cada vez. Registro en
`%LOCALAPPDATA%\Nullraptor\puente.log`. Cuando cambia `puente.ps1`, el lanzador cambia el que está en marcha.

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

## Herramientas propias (en caliente)

Además de Ruflo (viene con la imagen), la IA puede crear herramientas nuevas sin reconstruir la imagen. Cada una es
una carpeta `$TRABAJO_DIR/herramientas/<id>` (en el volumen) con su ficha `herramienta.json` y un servidor MCP por
stdio en Node (`scripts/herramientas.mjs` explica el formato; `config/claude-global.md`, lo que se le pide a la IA).

- **Propuesta → aprobada**: lo nuevo queda «propuesta». En el panel → **Herramientas** se ven sus archivos y, al
  aprobar, se guarda la huella sha256 de todo su contenido en `~/.nullraptor/herramientas.json` (las sesiones de
  Claude no pueden leerlo ni editarlo). Se aprueba la huella revisada: si cambió mientras la mirabas, se rechaza.
- **Si cambia, se para**: cualquier archivo distinto la deja «cambiada» hasta aprobarla otra vez. El lanzador
  (`scripts/herramienta-mcp.mjs`) lo comprueba **en cada arranque**, también si se reinicia a mitad de una sesión.
- **Llega en caliente**: aprobar o desactivar rehace `$TRABAJO_DIR/.mcp-agente.json`, y cada sesión remota nueva lo
  rehace antes de abrirse. Las sesiones ya abiertas no cambian. Cada una aparece como MCP `herramienta-<id>`.
- **Qué recibe**: solo `PATH`, `HOME`, idioma y las variables de su ficha, sacadas del cofre (si falta una obligatoria,
  no se activa). Nunca las credenciales del agente. Pero corre con los permisos del contenedor: revisa antes de aprobar.
- **Quién aprueba**: desde este equipo, o por Tailscale con la passkey confirmada en la última hora. Desde la red de
  casa con solo el código, no (desactivar sí). Todo queda en el registro de accesos.
- **Límite**: desde dentro del contenedor, una sesión podría llamar a la API del panel; lo que lo impide es que
  Claude va en modo manual y pregunta antes de cada orden. Llegan a las sesiones de Claude (Proyectos y el menú); el chat
  del panel y el flujo automático no cargan MCP.

## Chat con Claude y Codex a la vez

**Codex** (la CLI de OpenAI, con la suscripción de ChatGPT) va en la imagen con versión fijada (`@openai/codex` en
package.json). En Windows nativo se usa el de la app de Codex. Se inicia sesión una vez por equipo, desde la terminal
del contenedor: `codex login --device-auth` (da un código para abrir en el navegador); queda en el volumen
(`/estado/home/.codex`). `codex login status` dice si hay sesión.

Tras elegir proyecto: `c` en vez de Intro (`scripts/chat.mjs`). Sin destinatario contestan las dos, alternando quién
empieza, y cada una lee lo que dijo la otra; `@claude …` o `@codex …` habla con una; `/fin` cierra. Las dos **solo
leen** el proyecto (los cambios, por el flujo automático). Decisión [U] 29/10/2026: la bóveda es conocimiento, no un
registro de chats → la conversación completa queda solo en el equipo (`$TRABAJO_DIR/chats`, se borra a los 30 días) y
al cerrar Claude escribe en `Diario/AAAA-MM-DD.md` de la memoria un resumen de 2-5 viñetas; si ve una lección
reutilizable la propone, pero no la guarda sola. Cada mensaje a las dos gasta cuota de ambas suscripciones.

## Voz: Jarvis (decisión [U] 03/11/2026)

Todo en local y con el procesador, dentro del contenedor: **Whisper** «small» (faster-whisper, int8) para oír y
**Kokoro** (kokoro-onnx, voz española `em_alex`) para hablar. Se instala una vez en el volumen (dura entre
actualizaciones): `sh /nullraptor/scripts/voz-instalar.sh` (entorno en `/estado/sistema/voz`, versiones fijas en
`scripts/voz/requisitos.txt`, modelos ~850 MB). El panel arranca solo el servicio (`scripts/voz/servidor.py`,
`127.0.0.1:4330`, no se ve desde fuera) la primera vez que hace falta (`panel/lib/voz.mjs`, rutas `/api/voz/*`).

En el **Chat**, el botón **Voz**: mantén pulsado el micro, habla y suelta; se transcribe y se envía. La respuesta se
lee en voz alta («Callar» la corta) y, en este modo, la IA contesta como **Jarvis** (`PERSONA_JARVIS` en
`scripts/chat.mjs`: breve, sin formato, formal, te llama «señor»). No imita ninguna voz real. El micrófono solo
funciona desde este equipo (localhost) o por Tailscale (https); por la red de casa (http) el navegador no lo deja.
Tiempos en el i9: Kokoro ~2 s por cada 7 s de audio; Whisper ~2 s por frase.

## Director IA: un equipo de subagentes (03/11/2026)

Perfil opcional (desactivado por defecto) que convierte la sesión de Claude Code en el **Director** de un estudio:
coordina seis subagentes y responde de la calidad. Se elige al abrir la sesión en **Proyectos** (selector «Perfil:
Normal / Director IA»; se recuerda por proyecto en el navegador) o al crear un chat.

| Rol | Subagente | Modelo | Herramientas | Gasta de |
|---|---|---|---|---|
| Producto (Lucía) | `equipo-producto` | Sonnet | Read, Grep, Glob | Claude |
| Arquitectura (Marcos) | `equipo-arquitectura` | el de la sesión | Read, Grep, Glob | Claude |
| Desarrollo (Iker) | `equipo-desarrollo` | Sonnet | + Bash, Edit, Write | Claude (revisión) y **Codex** (código) |
| Calidad (Sara), veto | `equipo-calidad` | Sonnet | Read, Grep, Glob, Bash | Claude (+ Codex opcional) |
| Seguridad (Óscar), veto | `equipo-seguridad` | el de la sesión | Read, Grep, Glob, Bash | Claude |
| Diseño/UX (Nora) | `equipo-diseno` | Sonnet | Read, Grep, Glob, Bash | Claude |

- **Dónde está:** `config/perfiles/director.md` (el perfil) y `config/agentes/equipo-*.md` (el equipo). Al arrancar,
  `prepararIA` copia el equipo a `CLAUDE_CONFIG_DIR/agents/` y retira los `equipo-*` que ya no existan; nada llega
  a los proyectos. El perfil se pasa con `--append-system-prompt` al abrir la sesión (lista cerrada `PERFILES`).
- **Nada está hecho** sin `VEREDICTO: APROBADO` de Calidad (y de Seguridad si toca entradas, permisos, secretos,
  red o dependencias). Los subagentes no hablan con Daniel: devuelven sus preguntas al Director.
- **Codex programa** desde Desarrollo con `scripts/codex-parche.mjs`: los archivos van por la entrada (sin pasar por
  el contexto de Claude), Codex devuelve un diff y se aplica con `git apply`. Así se hace porque en el contenedor el
  sandbox de Codex (bwrap) no puede crear namespaces y Codex no puede ejecutar nada. El script solo admite archivos
  del proyecto y rechaza secretos (`.env`, claves, credenciales).
- **En el chat** (solo lectura) el Director va en modo consultor: analiza y opina; el equipo trabaja en las sesiones.
  Codex no tiene subagentes: con Codex no hay perfil.
- **Añadir un rol:** crea `config/agentes/equipo-<rol>.md` con el frontmatter (`name`, `description`, `tools`,
  `model`) y las reglas comunes del equipo, nómbralo en `config/perfiles/director.md` y amplía la prueba de
  subagentes en `tests/ia.test.mjs`. **Añadir un perfil:** `config/perfiles/<id>.md` + `PERFILES` en `scripts/ia.mjs`
  + la lista del selector en `panel/src/componentes/Perfil.jsx`.
- Ojo: `tools` no admite patrones como `Bash(npm test:*)` (probado con Claude Code 2.1.308: el subagente ejecutó
  otras órdenes). Que Calidad, Seguridad y Diseño no modifiquen nada es una norma escrita en su archivo.

## Ahorro de tokens (04/11/2026)

Medido con `node scripts/gasto.mjs` (y en Resumen → «Gasto de Claude»): en 7 días, el **99,6 %** del gasto fue Opus
y el **65 %** fue releer contexto, con una mediana de 177 k tokens por llamada (p90: 518 k). Lo que se hizo:

- **Sesiones limpias al reiniciar**: ya no se reabren con `--continue`; recuperan el estado de Ruflo
  (`task_list` y `proyecto-<X>/en-curso`) y `git log`. El botón «Continuar la anterior» sigue para cuando haga falta.
- **`opusplan`** en `settings.json` (lo pone `prepararIA`, `AHORRO` en `scripts/ia.mjs`): Opus en modo plan, Sonnet
  para ejecutar. Además, compactado al 50 % del contexto, salida de Bash a 15 000 caracteres, MCP a 10 000 tokens y
  sin los conectores de claude.ai (`ENABLE_CLAUDEAI_MCP_SERVERS=false`; para recuperarlos, quítalo de `AHORRO`).
- **CLAUDE.md global más corto** (de 7,1 a 4,9 KB, va en cada mensaje y en cada subagente): usar el PC y crear
  herramientas pasan a skills propias (`config/skills/nullraptor-*`, que `prepararIA` instala), que solo se cargan
  cuando hacen falta. Nueva sección «Gastar pocos tokens».
- **Medidor**: `panel/lib/gasto.mjs` lee los registros locales de Claude Code (solo lectura) y estima el coste con
  precios de API; da la proporción, no lo que se paga con la suscripción.
- **Tareas de la IA en Resumen**: las de Ruflo (`/estado/ruflo/tasks/store.json`), por proyecto.
- Sandbox de Codex en el contenedor: perfil `config/seccomp.json` aplicado por el lanzador y por compose (autorizado
  por Daniel el 04/11; ver «Relevo a Codex»).
- Código externo (autorizado por Daniel el 05/11): `gh` en la imagen; Context7 (`@upstash/context7-mcp@4.5.0`, versión
  fija) en `config/mcp.json`; y las skills oficiales de Anthropic con licencia Apache 2.0 (`frontend-design`,
  `webapp-testing`, `mcp-builder`) copiadas a `config/skills/anthropic-*` con su `LICENSE.txt`. Las de documentos
  (docx, pdf, pptx, xlsx) no se copian: su licencia no permite redistribuirlas.

## Relevo a Codex cuando Claude se queda sin tokens (04/11/2026)

Si Claude agota el límite de uso (o el saldo) en mitad de un desarrollo, Codex sigue por él en segundo plano:

1. **Detección**: `prepararIA` añade a `settings.json` el hook `StopFailure` (errores `rate_limit` y `billing_error`),
   que llama a `node scripts/relevo.mjs senal`. Solo vale dentro de `$TRABAJO_DIR/proyectos/<Proyecto>`.
2. **Briefing**: se arma con el estado `proyecto-<X>/en-curso` de Ruflo (si responde), las tareas abiertas `[<X>]`,
   la rama, `git status` y los últimos commits, más las reglas del relevo (una tarea cada vez, pruebas, commit pequeño
   sin `Co-Authored-By`, sin push ni instalaciones, parar si hace falta una decisión de Daniel).
3. **Codex**: `codex exec --sandbox workspace-write` en el proyecto, en un proceso aparte (el hook vuelve al instante),
   con tope de 3 h. Una sola vez por proyecto mientras siga en curso. Todo queda en `$TRABAJO_DIR/.relevo/`
   (nunca en el proyecto): `<X>.estado.json`, `.briefing.md`, `.log`, `.final.md` y el resumen `<X>.codex.md`.
4. **Panel**: Resumen muestra un aviso por relevo (en curso, terminado o detenido) con su resumen y su registro
   (`/api/relevo?proyecto=<X>`).
5. **Vuelta de Claude**: el hook `SessionStart` (`relevo.mjs revision`) le dice, una sola vez, que lea el resumen y el
   registro de Codex, revise sus commits, pase las pruebas y retome la lista. Codex no termina el desarrollo solo.

**Sandbox**: el de Codex (`bwrap`) necesita crear namespaces, y el seccomp por defecto de Docker lo impide. El perfil
`config/seccomp.json` (el de Docker más `clone`, `mount`, `pivot_root`, `setns`, `umount2` y `unshare` sin privilegios)
se aplica con `--security-opt`: `arrancar.ps1` lo saca de la imagen en cada arranque (`%LOCALAPPDATA%\Nullraptor\seccomp.json`)
y `compose.yaml` lo referencia. Ese cambio solo llega al recrear el contenedor con la imagen nueva. Si algún día hiciera
falta saltarse el sandbox, `RELEVO_SIN_SANDBOX=1` lanza Codex con `--dangerously-bypass-approvals-and-sandbox` (apagado
por defecto). Los hooks y el panel llegan con la imagen nueva (como todo cambio en `/nullraptor`).

## Panel web: una sola interfaz

`panel/` (añadido el 29/10/2026; reorganizado en la fase 4, 02/11/2026). Servidor Node sin dependencias
(`panel/servidor.mjs`) + web React/Vite/Tailwind (`panel/src`, diseño a partir de componentes de 21st.dev Magic).
Cinco pestañas:

- **Resumen**: sesiones de Claude abiertas (con acceso a su terminal), proyectos y su flujo, buscador y últimos
  cambios de la bóveda, chats y MCP del día. La bóveda no tiene pestaña: sus notas (árbol, `[[enlaces]]` y
  retroenlaces; solo lectura) se abren en `#/boveda/<ruta>` desde el buscador, los cambios o un proyecto.
- **Proyectos**: los del equipo y los que conoce la bóveda. En cada uno, abrir una **sesión de Claude Code** (abajo),
  chat, su nota de la bóveda, el flujo en vivo y los commits. **Traer**: crear uno nuevo (repositorio privado en
  GitHub con `GITHUB_TOKEN` + nota en `Proyectos/` + copia en el equipo), clonar uno por URL `https` o descargar uno
  que solo está en la bóveda (`panel/lib/proyectos.mjs`). Piden lo mismo que la terminal.
- **Chat**: eliges **Claude o Codex** y el proyecto; contesta solo esa, en solo lectura, y «Terminar y resumir»
  escribe en el Diario. (`node scripts/chat.mjs` en la terminal sigue con las dos.)
- **Herramientas**: las propias, para revisarlas y aprobarlas (ver «Herramientas propias»).
- **Ajustes**: versión (commit de la imagen) y actualización, acceso y passkeys, carpetas y servidores MCP.

Las rutas de antes (`#/inicio`, `#/trabajo`, `#/remoto`) llevan a su sitio nuevo.

**Sesión de Claude Code** (`panel/lib/remoto.mjs`, `pty.mjs`): «Abrir sesión» lanza `claude --remote-control --permission-mode
manual` en `$TRABAJO_DIR/proyectos/<P>` dentro de una terminal real (`script`, sin módulos nativos) con el entorno de
`preparar.mjs` (tokens y `BOVEDA_DIR`, nunca `AGENTE_CLAVE`). Se ve y se maneja en la terminal del panel (xterm.js,
con teclas Esc/Tab/flechas/Ctrl+C para el móvil) y a la vez desde claude.ai/code o la app (enlace y QR). Bajo la
terminal, una caja de escritura para lo que xterm no deja hacer en el móvil: pegar, dictar (reconocimiento de voz del
navegador, en español), adjuntar imágenes (galería, cámara o pegadas) y enviar con Intro o «Enviar». Las imágenes se
guardan en `$TRABAJO_DIR/adjuntos/<sesión>` (fuera del proyecto; Claude la recibe con `--add-dir`), se comprueban
por sus primeros bytes (PNG, JPEG, GIF, WebP; 10 MB) y se borran al cerrar la sesión. Los enlaces se abren con un
toque, también en la vista «Texto». Solo
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
(la tienda); habrá que generalizarlas con el segundo tipo de proyecto.

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
