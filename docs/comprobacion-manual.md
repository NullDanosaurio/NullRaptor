# Comprobación manual

Lo que `npm run verificar` y `npm test` no pueden probar desde el contenedor: necesita el PC con Windows, un
navegador, GitHub o gastar suscripción. Marca cada punto al hacerlo y anota el resultado en `docs/registro.md`.

Antes de empezar: `npm run verificar` dentro del contenedor debe salir en verde (Ruflo, memoria, bóveda, `gh`,
Context7, panel y gasto).

## 1. Tras una imagen nueva

- [ ] El flujo de GitHub Actions publicó `ghcr.io/nulldanosaurio/nullraptor` (pestaña Actions del repositorio).
- [ ] Reinicio desde el PC con el lanzador de siempre. En el contenedor: `gh --version` y `npm run verificar`.
- [ ] Una sesión que estuviera abierta se reabre sola, limpia, y dice en una línea dónde se quedó.

## 2. Windows (lanzadores)

- [ ] `arrancar.ps1 -Actualizar`: descarga la imagen nueva y reinicia el contenedor sin perder el volumen.
- [ ] Tarea programada de cada 5 minutos: aparece en el Programador de tareas y aplica una actualización pedida
      desde el panel.
- [ ] Doble clic sin opciones abre el panel; con `-SinActualizar` no toca la imagen.

## 3. Panel en el navegador (PC y móvil)

- [ ] Resumen, Proyectos, Chat y Herramientas cargan sin errores en la consola del navegador.
- [ ] En el móvil (ancho ~390 px) no hay scroll horizontal y la barra inferior es usable.
- [ ] Tarjeta de gasto del Resumen: las cifras coinciden aproximadamente con lo que muestra tu cuenta.
- [ ] «Clonar por URL» con un repositorio tuyo pequeño y «Nuevo» proyecto: aparecen en Proyectos y en la bóveda.
- [ ] Selector de perfil Normal / Director IA: se recuerda por proyecto.

## 4. Relevo a Codex (gasta suscripción)

Con un proyecto de prueba (no uno real) y una tarea pequeña en `en-curso`:

- [ ] Agotar el límite de Claude de verdad es difícil de forzar; alternativa: lanzar a mano
      `node scripts/relevo.mjs ejecutar <Proyecto>` dentro del contenedor.
- [ ] Codex escribe solo dentro del proyecto (sandbox con seccomp) y hace commits pequeños.
- [ ] El Resumen muestra el aviso del relevo con su resumen y registro (`/api/relevo?proyecto=<X>`).
- [ ] Al abrir Claude en ese proyecto, recibe una vez la nota de revisión y no la repite en la sesión siguiente.
- [ ] Limpieza: borrar `$TRABAJO_DIR/.relevo/<Proyecto>.*` y el proyecto de prueba.

## 5. Herramientas y acceso externo

- [ ] `gh auth status` (si Daniel quiere usar `gh`, el inicio de sesión lo hace él, no la IA).
- [ ] Una sesión nueva ve las skills `anthropic-*` y puede consultar Context7 (`resolve-library-id`).
- [ ] Herramientas propias aprobadas aparecen como MCP `herramienta-<id>`.

## 6. Copia de seguridad

- [ ] `node scripts/copia.mjs estado`: hay una copia de menos de 24 h en `/estado/copias` y otra en `/pc/Nullraptor/copias`.
- [ ] Restauración real, en una terminal interactiva:
      `node scripts/copia.mjs restaurar /estado/copias/<copia>.tar.gz.enc /tmp/prueba-restauracion <ruta-clave-privada>`
      y comprobar que `/tmp/prueba-restauracion/ruflo/tasks/store.json` existe. Borrar la carpeta después.
- [ ] La clave privada y su frase están guardadas fuera de `/estado` y fuera de `/pc/Nullraptor/copias`.
- [ ] El Resumen avisa de los proyectos con commits sin subir (y deja de avisar tras hacer `push`).

## Si algo falla

Anota el síntoma exacto (mensaje, pantalla, hora) y abre una tarea `[Nullraptor]` en Ruflo; no lo arregles sobre el
volumen real sin tener antes la copia de seguridad (`node scripts/copia.mjs crear`).
