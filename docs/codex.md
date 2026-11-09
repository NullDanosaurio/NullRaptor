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
| Tareas y decisiones | Mismos datos de Ruflo que Claude; namespace `proyecto-<Proyecto>`, clave `en-curso` |

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

El desarrollo interactivo usa `workspace-write` y `on-request`: las acciones permitidas dentro del sandbox pueden
continuar sin confirmación. Red o escrituras adicionales pueden requerir aprobación. Las autorizaciones
persistentes dependen de la sesión y del lanzador; la integración no desactiva el sandbox ni impone un bypass.
Se permite trabajar en adjuntos, el git del proyecto y la bóveda configurada. El relevo conserva su modo previo
de sandbox y su carpeta de resumen; `RELEVO_SIN_SANDBOX` solo se aplica si Daniel ya lo configuró explícitamente.

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
