---
name: nullraptor-pc
description: Usar el PC con Windows de Daniel desde el contenedor (pc.mjs) - ejecutar PowerShell o programas como Blender y slicers, archivos en /pc/Nullraptor, capturas de pantalla, ratón y teclado. Úsala antes de cualquier orden de pc.mjs.
---

# El PC de Daniel (Windows), como lo usaría una persona

`node /nullraptor/scripts/pc.mjs <orden>` (sin orden, la
  ayuda; `estado` dice el modo). Corre como el usuario de Windows de Daniel, con sus programas y su potencia.
  - Ejecutar: `ejecutar` con PowerShell por la entrada estándar (`pc.mjs ejecutar cwd=C:\… <<'FIN' … FIN`), p. ej.
    Blender en segundo plano (`& 'C:\Program Files\Blender Foundation\Blender 4.4\blender.exe' -b …`) o la línea
    de órdenes de un slicer. Programas con ventana: `iniciar programa=… args="…"`.
  - Archivos: la carpeta compartida `/pc/Nullraptor` (= `C:\Users\danoa\Nullraptor`, sin límite y directa) o
    `enviar` / `traer` (por trozos y comprobados; para archivos sueltos fuera de ella). Trabaja en
    `/pc/Nullraptor/<Proyecto>` (en Windows, `C:\Users\danoa\Nullraptor\<Proyecto>`): los programas del PC leen
    y escriben ahí mismo. Si `/pc/Nullraptor` no existe, la carpeta aún no está compartida: díselo a Daniel.
  - Pantalla: `ventanas`, `enfocar ventana=…`, `captura [ventana=…]` (guarda un PNG: ábrelo con Read para verlo),
    `raton accion=clic x=… y=…` (coordenadas de pantalla: pásalas desde la captura con su `escala`), `teclado
    texto=…` o `teclas=^s`. Mira con una captura antes y después de cada acción.
    Antes de escribir, comprueba en la captura qué ventana y qué campo reciben el texto y que no haya nada
    seleccionado: muchos programas (el Bloc de notas, editores) reabren documentos de Daniel. Para probar, usa un
    documento nuevo (Ctrl+N). Si escribes donde no debías, deshaz (Ctrl+Z) y no guardes.
  - Cuidado: no toques `%LOCALAPPDATA%\Nullraptor` (clave del cofre, token del puente), `~\.nullraptor` ni
    credenciales; no instales, desinstales ni borres nada en el PC sin decírselo antes a Daniel, y no cambies la
    configuración de Windows. Si el puente dice «modo solo consulta», Daniel lo ha cortado: no intentes saltártelo.
  - Los servicios del PC se alcanzan en `host.docker.internal:<puerto>` (mira `puertos`).
