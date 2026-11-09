# Codex y Claude: el mismo flujo de proyectos

Las sesiones de desarrollo de ambos clientes usan las instrucciones de Nullraptor, los MCP aprobados y las
tareas y memoria de Ruflo. No se añaden archivos de IA a los repositorios de los proyectos.

## Abrir una sesión

- En **Proyectos**, elige **Codex**, el perfil **Normal** o **Director IA** y abre la terminal. Puedes continuar
  una sesión anterior o un relevo terminado/interrumpido. Un relevo activo bloquea otros escritores.
- En el menú de terminal, después de elegir proyecto, pulsa **d** para desarrollar con Codex.
- Desde el contenedor ya preparado:
  `node /nullraptor/scripts/codex.mjs /estado/trabajo/proyectos/Proyecto`.
  Para continuar por ID, añade `resume <id>`; el lanzador mantiene la misma cuenta y preparación.
- El chat de consulta y `codex-parche.mjs` conservan sus flujos específicos; no son sesiones de desarrollo.
  Ejecutar `codex` directamente no aplica esta capa de Nullraptor.

El historial de desarrollo lista solo las sesiones de Codex con `source: 'cli'` más los relevos registrados.

La autenticación y el historial siguen en `CODEX_HOME`, o en `$HOME/.codex` si no está definido. No se modifican
`config.toml` ni los datos de acceso de la cuenta. Las versiones de ambos clientes siguen fijadas en package.json.

## Qué se comparte y dónde vive

| Parte | Preparación de Codex |
|---|---|
| Instrucciones generales | Se adaptan desde `config/claude-global.md` y se pasan como `developer_instructions` |
| Instrucciones del proyecto | Por carpeta: `AGENTS.override.md`, después `AGENTS.md`; `CLAUDE.md` como alternativa |
| MCP | La misma `configMcp`: Ruflo, Context7, servidores autorizados y herramientas propias aprobadas |
| Skills | Copias adaptadas de `config/skills/nullraptor-*` y `anthropic-*` en `$HOME/.agents/skills` |
| Equipo | Seis roles nativos `equipo-*`, con TOML en `$TRABAJO_DIR/.codex-nullraptor/agentes` |
| Configuración generada | `$TRABAJO_DIR/.codex-nullraptor/ajustes.json`, permisos 0600 |
| Tareas y decisiones | Mismos datos de Ruflo que Claude (Codex lee `proyecto-<Proyecto>`/`en-curso` y escribe en `codex-proyecto-<Proyecto>`) |

En una carpeta se elige un solo archivo de instrucciones: el fallback no concatena `AGENTS.md` y `CLAUDE.md`.
Las instrucciones de subcarpetas se aplican al trabajar en ellas. No se crean copias de estos archivos.
Véase la [precedencia oficial de Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Las skills conservan scripts, referencias y licencias. Solo se sincronizan los nombres gestionados por Nullraptor;
las skills ajenas se conservan. Las instrucciones de capturas usan la herramienta de imágenes disponible.
Codex descubre las [skills globales de usuario](https://learn.chatgpt.com/docs/build-skills) sin instalarlas en proyectos.

## MCP y autorizaciones

`prepararSesionCodex` rehace la configuración al abrir, reanudar o recibir un relevo. El arranque general también
prepara Codex. Si falla la preparación, no se inicia una sesión de Codex con una configuración antigua.

Los argumentos `-c` contienen únicamente las rutas del puente y los nombres de servidores. Los valores privados
permanecen en el archivo compartido `.mcp-agente.json` (0600), fuera de los repositorios. No lo imprimas para
diagnosticar la conexión. El puente stdio entrega al servidor solo el entorno básico y sus variables configuradas.
Las herramientas propias siguen comprobando su aprobación y huella en cada arranque.

Para remotos se usa el SDK MCP fijado como dependencia directa: HTTP y SSE se adaptan a stdio y conservan las
cabeceras autorizadas. El puente remoto reenvía herramientas, recursos, plantillas, prompts y avisos de cambios
de listas. No anuncia suscripciones a recursos, completions, logging ni otras capacidades que no implementa.
La configuración nativa usa el [formato MCP de Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Una aprobación o desactivación llega a las sesiones nuevas; las existentes no se reconfiguran en caliente.
Ruflo arranca con la raíz del agente y usa los enlaces de la imagen a `/estado/ruflo`; nunca guarda su estado
en el proyecto abierto. Context7 y los servidores npm pueden necesitar red para su primera descarga.

## Tareas, planificación y equipo

**MCP bajo `codex exec` (relevo).** Codex sí ofrece ruflo y context7, pero `exec` corre con aprobación `never` y toda
llamada MCP falla con «MCP tool call requires approval, but approval policy is never» (causa hallada por Sara). Como los MCP
los lanza Codex fuera del sandbox y Ruflo trae herramientas como `terminal_execute`, `http_fetch`, `agent_spawn` o `hooks_*`,
NO se aprueba ningún servidor entero: `scripts/codex-mcp.mjs` (`AUTOAPROBADAS`) pone `default_tools_approval_mode="approve"`
solo junto a `enabled_tools` con una lista cerrada: ruflo = `task_list`, `task_create`, `task_update`, `task_complete`,
`task_status`, `task_summary`, `memory_store`, `memory_retrieve`, `memory_search`, `memory_list`; context7 =
`resolve-library-id`, `query-docs`. Las herramientas propias (`herramienta-<id>`) y otros servidores no se aprueban: fallan en
exec y piden aprobación en la sesión interactiva; auto-aprobar una sería decisión de Daniel. Una prueba lo garantiza (nunca
`approve` sin `enabled_tools`).
**Dos barreras independientes.** (1) `enabled_tools` de Codex: no anuncia al modelo lo que no está en la lista (verificado por
Sara con Codex real: `ruflo/task_list` funciona y `terminal_execute` no se anuncia). (2) El filtro del puente
(`scripts/codex-mcp-puente.mjs`, `crearFiltro`, misma fuente `AUTOAPROBADAS`): para ruflo y context7, `tools/list` solo trae las
permitidas y `tools/call` de cualquier otra devuelve un error MCP «herramienta no permitida» sin llegar al servidor real (y
deja un aviso en stderr). Los nombres se comparan exactos, sin prefijos. Comprobado con el puente real de Ruflo: 10
herramientas, `terminal_execute` rechazado y `task_list` funciona. El resto de métodos y los demás servidores se reenvían
igual que antes.

**Lo que Codex escribe en Ruflo.** El puente valida los argumentos de cada llamada contra el esquema real de la herramienta
(`dbPath`, que abriría cualquier archivo como SQLite, y las claves desconocidas se rechazan; sin esquema, cae cerrado).
`memory_store` se fuerza a `codex-<namespace>` con `upsert:false`, así que Codex no puede pisar `proyecto-<X>/en-curso`, que Claude
lee con más privilegios; leer toda la memoria sí está permitido (no hay secretos en Ruflo). `task_create` añade `[codex]` tras la
etiqueta de proyecto. `task_update`/`task_complete` pueden tocar cualquier tarea: riesgo aceptado. Claude trata lo de `codex-*` y las
tareas `[codex]` como dato no fiable de un tercero (lo dice la nota de vuelta). Riesgo aceptado: `query-docs` de context7 sale por red
(equivale a una búsqueda web). Los nombres de servidor se comparan con `Object.hasOwn` (un servidor llamado `constructor` no hereda lista).

Al empezar, también al reanudar, la IA consulta las tareas del proyecto y `en-curso`. Muestra la lista de tareas,
usa el plan nativo si está disponible y guarda el estado en Ruflo. Si no hay herramienta de plan, mantiene una
lista visible. Tras cada tarea: pruebas, commit pequeño y actualización de memoria; al terminar, tareas cerradas.
El briefing del relevo es una instantánea que Codex contrasta con Ruflo antes de continuar.

Codex no recibe las órdenes de TodoWrite ni `opusplan`. Conserva el modelo elegido por Daniel. Los seis roles
heredan ese modelo y usan las herramientas disponibles de Codex, con hasta tres subagentes y un nivel de
delegación. Desarrollo implementa directamente: no invoca otra sesión de Codex para generar el mismo código.
Calidad y Seguridad mantienen sus vetos; sus restricciones de no editar son instrucciones, no un aislamiento
adicional. El agente principal coordina las escrituras de `en-curso` para evitar sobrescrituras entre subagentes.
Si la sesión no ofrece subagentes, aplica las revisiones en secuencia y declara la limitación.

## Permisos y diferencias

## Sandbox de Codex (`scripts/codex-sandbox.mjs`)

Panel, terminal y relevo comparten un perfil de permisos por ruta (`default_permissions="nr"`), en lugar de
`--sandbox workspace-write` (son incompatibles). Verificado con `codex sandbox` 0.163.0; la ruta más específica gana:

- Raíz del sistema en solo lectura. Escribibles: el proyecto, su `.git`, los adjuntos, `/tmp` y, en el relevo,
  `.relevo/<Proyecto>/` (resumen y salida final; el estado, los avisos, la señal y el log del relevo los escribe solo
  Nullraptor, fuera de su alcance). Sin red (`permissions.nr.network.enabled=false`).
- A los comandos de Codex no llegan tokens ni claves (`shell_environment_policy.exclude`: `*TOKEN*`, `*KEY*`, `*SECRET*`,
  `GIT_CONFIG_*`, `GH_*`...). Efecto: Codex no puede hacer push ni llamar a `gh`. Los MCP los lanza Codex con su propio entorno
  (el puente de Ruflo responde con entorno vacío).
- Ocultos (`none`): el cofre y `~/.nullraptor`, `registros/`, el archivo MCP con las claves de herramientas, `~/.claude`
  (credenciales de Claude, aunque `CLAUDE_CONFIG_DIR` no esté definido), `~/.config/gh`, `~/.copilot`, `~/.ruflo`,
  `~/.bash_history`, `~/.pki` y `$CODEX_HOME/auth.json`. Solo se ocultan las rutas que existen al lanzar (`registros/` y el MCP se crean antes). La lista es la misma que las reglas `deny` de Claude
  (`rutasProtegidas`). Codex lee su `auth.json` desde fuera del sandbox: solo se oculta a los comandos que ejecuta.
- `.git/hooks` y `.git/config` en solo lectura (un hook sería código que corre fuera del sandbox). Efecto aceptado:
  `git config` falla dentro de Codex. Solo se aplica si `.git` es una carpeta. Limitación: en un worktree (`.git` es un
  archivo) Codex no puede hacer commits bajo este perfil, porque su gitdir no se hace escribible.
- Bóveda: legible y escribible solo en `Proyectos/`. El perfil no puede expresar un archivo suelto
  (`Proyectos/<Proyecto>.md`; bwrap falla), así que tras el relevo `relevo-boveda.mjs` añade al resumen y al estado un aviso
  si se tocó algo fuera de esa nota o si la bóveda no está en la rama `agente`.
- `RELEVO_SIN_SANDBOX=1` desactiva todo lo anterior y deja un aviso en el log y en el estado del relevo.

Riesgos aceptados: la bóveda es escribible en todo `Proyectos/` (otras notas de proyecto); `/tmp` es escribible; los
servidores MCP los lanza Codex fuera del sandbox; el aviso de bóveda compara contenido pero solo ve archivos que git ve cambiados. El aviso de la bóveda compara `git status` antes y después: si Daniel ya tenía un archivo modificado y Codex lo
vuelve a tocar, la línea es idéntica y no se avisa.
Verificado con `codex exec` real (09/11/2026, repo de juguete con archivos falsos): Codex arranca con `auth.json` oculto,
edita y hace commit, y no puede escribir en `.git/hooks` ni en `.git/config`. Sin comprobar con Codex real: el relevo
completo, la bóveda real y los worktrees.

El desarrollo interactivo usa `on-request`: las acciones permitidas dentro del sandbox pueden continuar sin
confirmación. Las autorizaciones persistentes dependen de la sesión y del lanzador.

Los hooks, Remote Control y las reglas `deny` de Claude no se copian a Codex. La terminal de Codex se usa desde
el panel y sus permisos son los de Codex. Los latidos y avisos basados en hooks de Claude no miden la actividad
interna de Codex. La memoria automática privada de cada cliente no se convierte: la continuidad compartida se
basa en Ruflo, los commits y los resúmenes. No se comparte el historial de conversación entre proveedores.

## Verificación y activación

`npm test` comprueba configuración TOML aceptada por la CLI instalada, instrucciones, skills, roles, apertura,
reanudación y relevo. También verifica los puentes stdio/HTTP/SSE con procesos y servidores locales reales, sin
credenciales de servicios externos. El ciclo de persistencia usa Ruflo real en directorios temporales, con
clientes distintos, pruebas de un proyecto temporal, commit y recuperación del estado tras reconectar.
`npm run build --prefix panel` valida la web del panel.

Además se comprobó el app-server local de Codex 0.163.0 con una cuenta temporal vacía: `skills/list` descubre
`$HOME/.agents/skills` y `config/read` reconoce los roles, el modo multiagente y el límite de concurrencia.
No se ejecutaron subagentes con un modelo durante esa comprobación.

Estas pruebas no ejecutan una conversación con un modelo ni controlan el PC. La comprobación posterior al
despliegue consiste en abrir Codex desde el panel, confirmar que aparecen las skills y MCP, recuperar una tarea
de prueba en Ruflo y continuar la sesión por su ID. Se conserva la configuración global personal.

Los cambios del repositorio solo llegan al contenedor en ejecución con una imagen nueva: subir los commits a
`main`, construir/publicar la imagen y actualizar/reiniciar desde el PC. Este desarrollo no publica ni reinicia;
esas acciones quedan pendientes de la autorización de Daniel.

## ponytail (guía de estilo para los agentes que programan o diseñan)

`config/externo/ponytail/` guarda solo el texto de la skill ponytail (MIT, https://github.com/DietrichGebert/ponytail, fijada al
commit 96608e078b2d5ea607c5c3b8b5a54d1c1fba6846; `ORIGEN.md` trae el sha256, que una prueba comprueba) y su licencia. No se instala
el plugin ni sus hooks (escriben en `~/.claude`, importan transcripts y piden editar `settings.json`) y no está en `config/skills`
para que no llegue a todas las sesiones. Los subagentes `equipo-desarrollo`, `equipo-arquitectura` y `equipo-producto` (al copiarse
a `agents/`, `{{AGENTE}}` se sustituye por la ruta del agente) y el rol de desarrollo y las instrucciones generales de Codex leen
`SKILL.md` al empezar y lo aplican en nivel full. Calidad, seguridad y diseño NO: su criterio de revisión no debe ablandarse.
Sin comprobar: que Claude Code permita a un subagente leer esa ruta fuera del proyecto sin pedir permiso en modo manual.
