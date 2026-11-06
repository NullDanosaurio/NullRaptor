# Registro de trabajo

## 04/11/2026 (noche) — Sandbox de Codex en el contenedor (AHO-5)
- [U] Daniel autoriza el perfil seccomp y el cambio del lanzador y de compose.
- Hecho: `arrancar.ps1` saca `config/seccomp.json` de la imagen (`docker create` + `docker cp`) y arranca con
  `--security-opt seccomp=<ruta>`; `compose.yaml` lo referencia en `security_opt`. Sintaxis del script comprobada en el PC.
- Sin probar [O]: el contenedor actual sigue con el seccomp por defecto; se verá al recrearlo con la imagen nueva
  (`codex exec --sandbox workspace-write` debe poder crear un archivo). `RELEVO_SIN_SANDBOX` queda apagado.

## 04/11/2026 — Relevo a Codex cuando Claude se queda sin tokens
- [U] Daniel: «cuando claude se quede sin tokens se pueda usar codex para que coja el lugar de claude y siga
  trabajando en los desarrollos». Elegido [U]: automático en segundo plano, y Claude retoma y revisa al volver
  (Codex no acaba solo el desarrollo).
- Hecho: hook `StopFailure` → `scripts/relevo.mjs` (señal, briefing, `codex exec` aparte, estado y registro en
  `$TRABAJO_DIR/.relevo/`); hook `SessionStart` con la nota de vuelta; aviso y registro en Resumen (`/api/relevo`).
- Decisión [O]: el estado de Ruflo se lee con su CLI (opcional); Codex deja su resumen en `.relevo/<X>.codex.md`
  en lugar de escribir en la memoria de Ruflo (no tiene su MCP).
- Hallazgo [O]: el sandbox de Codex falla en el contenedor (`bwrap: No permissions to create a new namespace`), así
  que Codex no puede escribir archivos hasta que se autorice el perfil seccomp (AHO-5). Interruptor explícito
  `RELEVO_SIN_SANDBOX=1`, apagado: lo decide Daniel.
- Probado: hook real con Codex falso (vuelve en 29 ms; estado en curso → terminado), aviso de vuelta una sola vez,
  157 pruebas. Sin probar con el límite real de Claude ni con Codex real escribiendo (por el sandbox).

## 04/11/2026 — Ahorro de tokens: medir primero
- [U] Daniel: «realmente quiero ahorrar tokens… siento que apenas estamos raspando lo que podemos hacer contigo»;
  acepta todas las mejoras y `opusplan`. Y: «no veo tus tareas en la pestaña resumen».
- Medido [O] (registros de Claude Code, 7 días): 99,6 % Opus; 65 % del gasto en releer contexto, mediana 177 k
  tokens por llamada y p90 518 k; instrucciones fijas, poco. Conclusión: el ahorro está en el modelo y en la
  longitud de las sesiones, no en instalar más cosas (cada MCP añade herramientas a todas las sesiones).
- Hecho: reanudar sin `--continue`; `AHORRO` en settings.json (`opusplan`, compactado al 50 %, salidas acotadas,
  sin conectores de claude.ai); medidor (`panel/lib/gasto.mjs`, `/api/gasto`, tarjeta y `scripts/gasto.mjs`);
  tarjeta «Tareas de la IA» con las de Ruflo; CLAUDE.md global de 7,1 a 4,9 KB con skills `nullraptor-pc` y
  `nullraptor-herramienta`; `gh` instalado con `paquetes`.
- Bloqueado por el modo automático [O]: `npx ccusage` (código externo: se hizo un medidor propio) y el cambio del
  lanzador y de compose.yaml para usar `config/seccomp.json` (perfil de Docker + `clone`, `mount`, `pivot_root`,
  `setns`, `umount2`, `unshare` sin privilegios, lo que pide bwrap). Comprobado: el núcleo admite namespaces
  (max_user_namespaces 63809) y lo que los bloquea es el seccomp por defecto de Docker («unshare: Operation not
  permitted»). Queda para que Daniel lo autorice.
- Pruebas [O]: 146/146; tarjetas revisadas a 360 px.

## 03/11/2026 — Director IA: equipo de subagentes, perfil y Codex como programador
- [U] Daniel: perfil «Director IA» que coordina Producto, Arquitectura, Desarrollo, Calidad, Seguridad y Diseño/UX;
  encargo detallado (subagentes, perfil, instalación, activación opcional, pruebas, documentación). Nombre: NullRaptor.
- [U] Por el gasto de tokens: un modelo por rol ya (Arquitectura y Seguridad heredan el de la sesión; el resto,
  Sonnet) y **Codex** en el equipo, que gasta de la cuenta de ChatGPT. Jev queda para después; si el propio equipo
  basta para ahorrar, lo sustituye.
- Comprobado [O]: `tools: Bash(echo:*)` en un subagente no restringe (ejecutó `ls /`) → norma escrita en Calidad,
  Seguridad y Diseño. El sandbox de Codex no funciona en el contenedor («bwrap: No permissions to create a new
  namespace»): ni `workspace-write` ni `read-only` pueden ejecutar órdenes (el flujo con Codex tampoco podrá aquí).
  Alternativa probada: archivos por la entrada → diff → `git apply` (`scripts/codex-parche.mjs`, también
  `--revisar` para una segunda opinión de Calidad).
- Decisiones [P→U]: Director en modo consultor en el chat (sin ampliar sus herramientas); perfil recordado en
  localStorage por proyecto; el registro y `reanudar.json` guardan solo el nombre del perfil (una sesión del
  Director vuelve como Director tras actualizar); perfil desconocido → 400; con Codex, sin perfil.
- Pruebas [O]: 140/140. Selector revisado a 360 px. API: perfil inválido y Codex+Director → 400. codex-parche real:
  aplica un diff, rechaza `.env` y revisa («Sin objeciones»). [?] Sin probar: una sesión real del Director con el
  equipo (queda para la primera tarea del equipo, revisar su propio funcionamiento).
- Primera tarea del equipo [O]: el Director (`claude -p`, solo lectura, sin MCP) revisó su propio funcionamiento
  con Marcos e Iker. 0,53 USD en 91 s: Opus (el Director) 0,47 y Sonnet (subagentes) 0,06. Hallazgos: el gasto
  está en los lanzamientos (4–8 k tokens fijos cada uno) y en leer el diff y las pruebas varias veces, no en el
  texto de los prompts. Veredicto sobre Jev: no hace falta (modelo por rol + Codex ya cubren; Jev saldría de la
  suscripción a pago por API y mandaría el código a TypeSafe).
- Aplicado [P→U] (bajo riesgo, sin tocar reglas de Daniel): `codex-parche --probar` (aplica, prueba y devuelve
  «pasan» o el final), salidas recortadas a 15 líneas con el resto en un archivo, encargos cortos y máximo dos
  llamadas a Codex por tarea, diff leído una sola vez, informes de 10 líneas si se aprueba, el Director no lee el
  código que revisa otro y nada de enjambres de Ruflo. Pendiente de Daniel: Calidad opcional en cambios pequeños,
  Producto y Arquitectura solo cuando hagan falta, Seguridad en Sonnet.

## 03/11/2026 — El panel, pensado para el móvil (y la app)
- [U] Daniel: «las apps que realizas son navegadores sin más, apenas es responsive, no es cómodo navegar», y no
  encuentra el modo voz en la app. Lección de Roleplay (bóveda): revisar con capturas a 320–412 px, no suponerlo.
- Revisión [O] a 360 y 412 px: nada se salía de la pantalla, pero Bóveda no estaba en la barra, Jarvis escondido
  dentro de un chat, tarjeta de Resumen cortada (hijo de grid sin min-width:0), tarjeta de sesión con el texto en
  una columna estrecha, títulos de tareas cortados y filas de la bóveda de menos de 32 px.
- [U] Barra del móvil: Inicio · Proyectos · Jarvis (centro, grande) · Bóveda · Más (Chat, Herramientas, Ajustes en
  una hoja); botones de 56 px. Escritorio: barra lateral con todo. Vista Jarvis (`vistas/Jarvis.jsx`): voz a
  pantalla completa sobre un proyecto, con subtítulos, teclado y Callar.
- Arreglos: `.grid > * { min-width: 0 }`, títulos en dos líneas, botones de la sesión a lo ancho, filas de la bóveda
  de 44 px en el móvil, margen superior seguro (la app es de borde a borde).
- App: permiso de micrófono (Capacitor lo concede al WebView), Atrás retrocede en el historial del panel, barra de
  estado oscura. Antes, allowNavigation *.ts.net no casaba con maquinote.taile75fb6.ts.net (Capacitor exige el
  mismo número de partes) y el panel se abría fuera, en Chrome: ahora *.*.ts.net.
- `scripts/revisar-movil.mjs`: revisor con capturas a 360/412/1280 (playwright-core fuera del repo). Pruebas 134/134.
  [?] Sin probar en el móvil real: micrófono, Atrás y la entrada por Chrome.

## 03/11/2026 — Botones de copiar en el chat
- [U] Mejora prioritaria: copiar bloques de código y respuestas de la IA en el chat; sin push.
- `panel/src/portapapeles.js`: `alPortapapeles` (antes en Terminal.jsx) devuelve si copió y nunca lanza; sin
  `navigator.clipboard`, textarea de solo lectura fuera de la vista (16 px, `select()` + `setSelectionRange` para iOS)
  que devuelve el foco. La terminal lo usa igual que antes (borra la selección o avisa «Copiado» solo si funcionó).
- `componentes/Copiar.jsx` (Copiado / No se pudo copiar, 1,5 s); Markdown: bloques de código con cabecera (lenguaje y
  Copiar, siempre visible; `panel/src/codigo.js` saca el texto exacto del árbol hast); Chat: Copiar junto a la hora en
  los mensajes de la IA.
- Pruebas [O]: 126/126 y build. En el Edge del PC (copia del panel en 4777): bloque y mensaje copiados idénticos con
  `navigator.clipboard` y con la reserva (API ocultada por DevTools en un Edge aparte), «Copiado» visible, y «No se pudo
  copiar» con un clic sin gesto. [?] Sin probar: Safari/iOS, Firefox, la terminal interactiva y http real por la red.

## 03/11/2026 — Voz: Jarvis con Whisper y Kokoro
- [U] Daniel: «whisper + kokoro para añadir una voz al agente, me gustaría que se pareciera a Jarvis». Decisiones [U]:
  en el contenedor (CPU), en el panel con pulsar y hablar, voz española `em_alex`. Jev (router de TypeSafe AI):
  no por ahora (otro proveedor con clave de OpenRouter; ahorros sin pruebas independientes).
- `scripts/voz/servidor.py` (HTTP en 127.0.0.1:4330: /estado, /transcribir, /hablar; modelos cargados una vez),
  `scripts/voz-instalar.sh` (entorno y modelos en `/estado/sistema/voz`), `panel/lib/voz.mjs` (arranca el servicio
  cuando hace falta, limpia el Markdown antes de hablar) y `panel/lib/rutas-voz.mjs`.
- Chat: botón Voz (`panel/src/voz.js` graba con MediaRecorder y reproduce en cola); `voz: true` en el mensaje añade
  `PERSONA_JARVIS` (Claude con `--append-system-prompt`; Codex, delante del texto).
- Pruebas [O]: 121/121. Kokoro → Whisper de ida y vuelta, idéntico. En el PC de Daniel (copia del panel en 4777):
  modo voz activado, respuesta de Jarvis sobre Modelos3D y servicio de voz arrancado por el navegador para leerla.
  [?] Falta que Daniel confirme que la oye y pruebe el micro.

## 03/11/2026 — Grafo de la bóveda (como Obsidian)
- [U] Daniel quiere ver la bóveda como el grafo de Obsidian, «el cerebro con conexiones», en la vista Bóveda.
- `GET /api/boveda/grafo` (`panel/lib/boveda.mjs`): notas como nodos, `[[enlaces]]` resueltos por ruta o nombre como
  conexiones sin dirección, nodos fantasma para lo que aún no existe; grupo = carpeta de hasta dos niveles.
- `panel/src/grafo.js` (física sin dependencias: repulsión, muelles, gravedad, se para sola) y
  `componentes/Grafo.jsx` (canvas: colores por carpeta, tamaño por conexiones, desplazar, zoom con rueda o dos
  dedos, arrastrar nodos, resaltar vecinas al pasar por encima, clic abre la nota, botones Fantasmas y Centrar,
  leyenda). La portada de la Bóveda tiene pestañas Grafo / Cambios recientes; en el móvil, botón «Grafo».
- Pruebas [O]: 119/119. Probado en el PC de Daniel con una copia del panel en 4777 (abierta en Edge desde el puente):
  61 notas y 101 conexiones; ajustados los colores (dos niveles), los nombres visibles y las notas sueltas.

## 03/11/2026 — Puente con el PC probado en modo completo
- Pruebas [O] contra MAQUINOTE con la imagen 05864ef: `ejecutar` (PowerShell 5.1, acentos, código de salida y
  errores), `enviar`/`traer` de 20 MB idénticos (SHA-256; 1 s y 2 s), `ventanas`, `captura` de los dos monitores
  (3840×1080) y de una ventana, `iniciar`, `teclado` con acentos y caracteres especiales, `raton` mover, Blender
  4.4.3 con `-b`. ElegooSlicer está en `C:\Program Files\ElegooSlicer\elegoo-slicer.exe`, pero `--help` no imprime
  en consola (es un programa con ventana; para laminar, redirigir la salida).
- Incidente: el Bloc de notas de Windows 11 reabrió una pestaña de Daniel (`config.toml` de Codex) con todo
  seleccionado, y el texto de prueba la sustituyó. Se deshizo con Ctrl+Z (sin guardar; el archivo del disco no se
  tocó). Además, `enfocar` pulsaba Alt para traer la ventana al frente, y eso activaba los atajos del menú: el primer
  Ctrl+Z fue al menú.
- Arreglos: `enfocar` usa AttachThreadInput (sin teclas). Instrucciones de la IA: antes de escribir, comprobar con una
  captura la ventana, el campo y que no haya nada seleccionado; para probar, un documento nuevo.
- Carpeta `C:\Users\danoa\Nullraptor` compartida desde Ajustes → `/pc/Nullraptor`: probada en los dos sentidos. Con la
  imagen 9137032, `enfocar` trae la ventana al frente sin activar los menús (probado con Docker Desktop).

## 02/11/2026 — Archivos con el PC sin límite de 50 MB
- [U] ¿Por qué 50 MB? Era por precaución: el archivo iba entero en una línea JSON en base64, con varias copias en la
  memoria de PowerShell y el puente bloqueado mientras tanto. [U] Daniel pide las dos alternativas:
- `enviar`/`traer` por trozos (4 MB por petición; el puente acepta hasta 8 MB): poca memoria, el puente atiende otras
  órdenes entre trozo y trozo, `.parcial` que se renombra al final y comprobación SHA-256 en los dos lados.
- Carpeta compartida `C:\Users\danoa\Nullraptor` → `/pc/Nullraptor` para el trabajo diario (Modelos3D): montaje directo,
  sin límite. Se crea y se pide desde Ajustes cuando esté la imagen nueva (hace falta `ejecutar` en el PC).
- Pruebas [O]: 116/116 (puente falso por trozos con la misma lógica que `puente.ps1`).

## 02/11/2026 — Control completo del PC y sudo (para Modelos3D)
- [U] Daniel: Modelos3D necesita más (bóveda: libGL para build123d, ElegooSlicer y Blender del PC, archivos,
  capturas). «Quiero que la IA pueda usar un equipo completamente funcional como lo haría un humano», aunque sea con
  sudo o control del equipo; si Docker limita usar el PC con sus apps y su potencia, no le gusta.
- Decisión: Docker se queda como cerebro (portátil, se actualiza solo) y el puente pasa a brazo completo sobre
  Windows. [U] Orden libre con la aprobación de Claude Code; pantalla con ratón y teclado; sudo con paquetes
  persistentes.
- Imagen: sudo, libGL/EGL/X11 (OCP pedía libGL.so.1 y libX11.so.6), `paquetes` (`scripts/paquetes.mjs`).
- `puente.ps1`: ejecutar, iniciar, enviar/traer, ventanas, enfocar, captura, raton, teclado; modo consulta con
  `puente-consulta` (`-PuenteConsulta`/`-PuenteCompleto`); JSON con JavaScriptSerializer (sin el límite de 2 MB de
  PowerShell 5.1); coordenadas en píxeles reales (SetProcessDPIAware). `pc.mjs`: script por la entrada estándar,
  capturas a PNG, archivos de ida y vuelta.
- Pruebas [O]: 115/115. [?] `puente.ps1` sin probar: en el contenedor no hay PowerShell (se denegó descargarlo);
  revisado a mano. Se prueba contra el PC en cuanto se instale la imagen (tarea 5 en Ruflo).

## 02/11/2026 — Puente con el PC probado
- [O] Desde el contenedor, contra MAQUINOTE (Windows 11 Pro): responden `estado`, `sistema`, `procesos`, `puertos`,
  `programas`, `winget-buscar` y `notificar`. Se rechazan una orden fuera de la lista, un token incorrecto y una
  URL `file://`. `abrir-url` con una dirección válida no se probó (abre el navegador).
- Arreglos en `puente.ps1`: las listas de un solo elemento llegaban como objeto (`,@(...)`), y la salida de winget
  llegaba con los acentos rotos (se lee como UTF-8).

## 02/11/2026 — El lanzador se reiniciaba sin pedirlo
- [U] Nullraptor se reinició sin pedir la actualización; Windows mostraba «El término '#' no se reconoce» y lo mismo
  con `param` en `arrancar.ps1`.
- Causa [O]: desde ffd983a, `arrancar.ps1` empezaba con dos BOM. PowerShell quita uno y el otro queda delante de la
  primera línea: `param(...)` deja de ser lo primero, falla, y los modificadores se pierden. La tarea de cada 5 minutos
  (`-Actualizar`) hacía un arranque normal, sin mirar si había sesiones abiertas.
- Arreglo: un solo BOM, y `tests/scripts-windows.test.mjs` comprueba que todos los .ps1 llevan exactamente uno.
- [?] La CI no pasa `REVISION` a la imagen (Ajustes no muestra la versión). Falta añadir en `imagen.yml`
  `build-args: REVISION=${{ github.sha }}`; el token del agente no puede cambiar workflows: lo hace Daniel.
- Pruebas [O]: 109/109. La copia instalada del lanzador se refresca desde la imagen en el siguiente arranque completo.

## 02/11/2026 — Instalar, puente con el PC, reinicios sin perder trabajo, Ruflo y tareas
- [U] Daniel: la IA no puede instalar casi nada, no puede hablar con el PC, las actualizaciones cortan a los agentes
  y lo dejan a medias sin acordarse, y en los proyectos no se usa Ruflo ni se listan las tareas al pedir un desarrollo.
- Causas [O]: usuario `node` sin sudo, sin Python ni curl y con `npm -g` en `/usr/local` (sin permiso). En el PC no
  escuchaba nada. Al actualizar, `docker rm -f` mataba el contenedor; además `preparar.mjs` (PID 1) lanzaba el panel
  con `spawnSync` y no podía pasarle SIGTERM, así que tampoco cerraba nada en orden. Las tareas de Ruflo se guardaban
  en `/nullraptor/.claude-flow/tasks`, dentro de la imagen: se perdían en cada actualización. Las instrucciones
  decían «Ruflo cuando aporte, no por rutina» y nada de listas de tareas.
- Instalar [U: en el volumen]: Dockerfile con curl, unzip, Python 3 y build-essential; `npm -g` y `pip` en
  `/estado/sistema` (en el PATH).
- Puente [U: lista blanca]: `scripts/puente.ps1` (Windows, 127.0.0.1:4329, token) + `scripts/pc.mjs` (contenedor).
- Reinicios: `docker stop -t 30` antes de recrear; `preparar.mjs` reenvía las señales; el panel guarda
  `reanudar.json` y al volver reabre las sesiones con `claude --continue` y un aviso para seguir. Botón «Continuar la
  anterior» en el proyecto. Estado de Ruflo enlazado a `/estado/ruflo` (`preparar.mjs` crea las carpetas que falten).
- `config/claude-global.md`: en cada desarrollo, lista de tareas visible (TodoWrite y en la respuesta), tareas en
  Ruflo (`task_create` con el proyecto), estado en su memoria (`proyecto-<Proyecto>`/`en-curso`) y commits por tarea;
  al empezar, mirar si hay algo a medias. Cómo instalar y cómo usar el puente.
- Pruebas [O]: 108/108. Web construida. Desde el contenedor se llega a `host.docker.internal`. [?] Sin probar en
  Windows (`puente.ps1`, lanzador) ni la reanudación con una imagen real; llega con la imagen nueva.

## 02/11/2026 — Puerto de las apps de los proyectos
- [U] Daniel quiere ver Roleplay (servidor en 4777) desde el PC igual que el panel; solo se publicaba el 4321.
- `scripts/arrancar.ps1` publica también `127.0.0.1:4777:4777`, siempre solo en el equipo (también en modo red),
  porque las apps no tienen control de acceso. `NULLRAPTOR_PUERTOS` (p. ej. `4777,5173`) cambia la lista. La app
  tiene que escuchar en `0.0.0.0` dentro del contenedor (Roleplay: `HOST=0.0.0.0`).
- Pruebas [O]: 103/103. [?] Sin probar en Windows (no hay PowerShell en el contenedor); llega al recrear el
  contenedor con la imagen nueva.

## 02/11/2026 — Copiar desde la terminal
- [U] Ya se pega, pero no se copia nada de la terminal del panel.
- Causa: Claude Code 2.1 va a pantalla completa y captura el ratón (`?1049h`, `?1000h`–`?1006h`): al arrastrar
  selecciona él y copia mandando un OSC 52 (`ESC ]52;c;<base64>`), porque el contenedor no tiene portapapeles.
  xterm.js no entiende OSC 52 y lo tiraba. `Terminal.jsx` lo recoge (`panel/src/osc52.js`) y lo copia al
  portapapeles del navegador; si el navegador no deja copiar sin un clic, el botón «Copiar» lo copia.
- Pruebas [O]: 103/103. Web construida. Sin probar todavía en el navegador de Daniel (aquí no arranca Chromium).

## 02/11/2026 — Pegar con Ctrl+V en la terminal
- [U] Daniel no podía pegar en la terminal del panel lo copiado de otra sesión.
- Causa: xterm convierte Ctrl+V en ^V y anula el pegado del navegador; Claude Code lo toma como «pegar imagen» del
  portapapeles del contenedor, que está vacío. `Terminal.jsx` deja pasar Ctrl+V (y Ctrl+Mayús+V) al navegador, que
  pega el texto como bracketed paste. Las imágenes o archivos pegados se suben como en el redactor y llega su ruta.
- Pruebas [O]: 101/101. Web construida. Sin probar todavía en el navegador de Daniel.

## 02/11/2026 — Adjuntos en la terminal: más tipos de archivo
- [U] Daniel pide adjuntar más que imágenes desde el redactor de la terminal.
- `panel/lib/adjuntos.mjs`: imágenes (PNG, JPEG, GIF, WebP), PDF, Office (docx, xlsx, pptx, odt, ods, odp) y texto o
  código (~55 extensiones), de hasta 20 MB (antes 10 MB, solo imágenes). Se decide por la extensión y se comprueba
  con el contenido (firma `%PDF-`, zip, imagen o UTF-8 válido sin bytes nulos); el tipo del navegador no cuenta.
- Nombre saneado (sin rutas ni caracteres raros, 60 caracteres) y numerado (`1-informe.pdf`) para que no se pisen.
  La ruta `/api/remoto/<id>/imagen` pasa a `/archivo`, con el nombre en la cabecera `X-Nombre`. La CSP admite `blob:`
  en imágenes (vistas previas). Redactor: clip en vez del botón de imagen; ficha con nombre para lo que no es imagen.
- Pruebas [O]: 101/101 (`tests/adjuntos.test.mjs` nuevo; remoto y tailscale adaptadas). Web construida. Commit
  `ac8ffa4` subido a `main`.
- [?] Sin probar con archivos reales desde el móvil ni en un navegador (no hay en el contenedor); no se pudo ver si
  la CI publicó la imagen (sin `gh`).

## 02/11/2026 — Fase 5: lanzador simple y Nullraptor como aplicación
- [U] Acceso (red de casa, Tailscale) y carpetas de Windows desde Ajustes, desde el PC o por Tailscale con passkey
  confirmada (opción recomendada que eligió Daniel). [U] Daniel pide que la web se abra como una aplicación propia
  (como Spotify o Discord): Edge/Chrome en modo app con perfil aparte + manifiesto para el móvil. Un ejecutable propio
  (Electron) queda para más adelante si lo pide.
- Panel: `panel/lib/equipo.mjs` y `rutas-equipo.mjs` (pedido → `$TRABAJO_DIR/equipo/pedido.json`; resultado del
  lanzador en `resultado.json`), Ajustes editable (`componentes/AjustesEquipo.jsx`), manifiesto e iconos PNG/ICO.
- Lanzador: doble clic sin opciones; aplica el pedido (todo o nada) al abrirlo y en la tarea de cada 5 minutos, abre
  la ventana propia, pasa `NULLRAPTOR_LANZADOR` y `NULLRAPTOR_CARPETAS` al contenedor. Corregido: la raíz de una
  unidad (`D:\`) no se montaba bien. Instalador: sin la pregunta de la red; acceso directo con icono.
- Pruebas [O]: 98/98 (pedido, permisos, raíz de unidad, manifiesto). Expresión de rutas sin vuelta atrás exponencial
  (la primera versión se colgaba con 5000 caracteres).
- [?] El lanzador y el instalador **sin ejecutar**: no hay Windows ni PowerShell en el contenedor (descargar
  PowerShell para comprobar la sintaxis no se permitió). Solo revisados a mano y con un contador de llaves y comillas.

## 02/11/2026 — Fase 4: una sola interfaz (F4-1 a F4-3)
- [U] Decisiones de Daniel: la terminal de Claude va dentro de Proyectos (sin pestaña Remoto); la bóveda se reparte
  (nota en cada proyecto; buscador y cambios en Resumen; sin pestaña); en el Chat se elige Claude o Codex (sin «Las dos»).
- F4-1: traer proyectos desde el panel (`panel/lib/proyectos.mjs`): descargar uno de la bóveda, clonar por URL https
  (con su nota) y crear uno nuevo en GitHub. Mismo permiso que la terminal. `/api/ajustes`; la imagen lleva su commit
  (`NULLRAPTOR_REVISION`; falta que la CI lo pase con `build-args: REVISION=${{ github.sha }}`: el token del cofre no
  tiene permiso `workflow` y GitHub rechazó subir ese cambio, lo hace Daniel).
- F4-2: el chat del panel abre con una sola IA; `scripts/chat.mjs` en la terminal sigue con las dos.
- F4-3: pestañas Resumen, Proyectos, Chat, Herramientas y Ajustes; las rutas antiguas redirigen.
- Pruebas [O]: 93/93. Real: panel en otro puerto; «Descargar al equipo» clonó TuRinconDeLectura de GitHub en 11 s.
- [?] Sin probar en un navegador (no hay en el contenedor) ni «Clonar por URL»/«Nuevo» contra GitHub y la bóveda
  reales (escribirían en ellos); sí con repositorios locales en las pruebas.

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

## 05/11/2026 — Código externo (AHO-6)
- Autorizado por Daniel («todo»): `gh` en la imagen, Context7 fijado a 4.5.0 en `config/mcp.json` y tres skills de
  Anthropic con licencia Apache 2.0 en `config/skills/anthropic-*`. `instalarSkills` ahora gestiona los prefijos
  `nullraptor-` y `anthropic-`.
- Descartadas docx, pdf, pptx y xlsx: licencia propietaria, no redistribuible en el repositorio.

## 06/11/2026 — Verificación y copia de seguridad (VER, COP)
- `npm run verificar` ahora comprueba también `gh`, Context7 (arranca con `npx`), la web del panel (levantado en
  memoria con carpetas temporales) y la API de gasto. Lo que solo se prueba en el PC está en `docs/comprobacion-manual.md`.
- Copia cifrada del volumen (`scripts/copia.mjs`, `panel/lib/copias.mjs`): clave pública en el volumen y privada fuera,
  rotación de 7, segunda copia en el PC, restauración solo a carpeta vacía con la autenticidad comprobada antes de
  extraer. Diaria desde el panel. Fuera de la copia, por decisión de Daniel (nunca copiar credenciales): credenciales,
  passkeys y cofre; tras perder el volumen hay que volver a iniciar sesión.
- Hallazgo: Modelos3D y Roleplay tenían commits sin subir; ahora el Resumen lo avisa.
- Un `!` del prompt de Claude Code no tiene terminal: `copia.mjs` pide la frase solo en una terminal interactiva o por
  `COPIA_FRASE`, y avisa en lugar de quedarse colgado.
- [?] Sin probar: restaurar una copia real con la frase de Daniel y la tarjeta del Resumen en el navegador.

## 06/11 — Relevo a Codex probado de verdad y tarjeta de copia siempre visible
- Prueba real (proyecto desechable, `relevo.mjs senal` → `ejecutar`): Codex con la cuenta de ChatGPT creó código y pruebas
  y dejó el resumen en `.relevo/`. Hallazgo: su sandbox deja `.git` en solo lectura y no podía hacer el commit. Ahora
  `argsCodex` añade `--add-dir <proyecto>/.git` (solo si es una carpeta) y Codex hace el commit él mismo.
- [?] Sin comprobar: que el hook `StopFailure` se dispare con un límite real de Claude (solo se simuló la señal).
- El Resumen enseña siempre la copia («al día, la última hace X h») y los proyectos sin subir se calculan al arrancar el
  panel y cada hora, no solo al hacer la copia (tras un reinicio salía vacío hasta la copia del día siguiente).
