# Vistas de componentes — visión y plan de cimientos

Estado a 10/11/2026. **Nada de esto está construido salvo la fase 1** (orden de tarjetas del Resumen). Falta la aprobación de Daniel para empezar la entrega E1.

## Visión (Daniel)

Nullraptor como espacio para **trabajar en los repositorios**, no solo para mirarlos. Las vistas se forman con componentes reutilizables, con lógica de negocio propia y aislada, filosofía Notion: arrastrables, con pesos horizontales y verticales, instancias duplicables y fuentes de datos adaptables.

Los casos que mencionó son **solo ejemplos para diseñar los cimientos**; no hay que construirlos ahora:

- Componente Terminal: elegir repositorio, «sesión nueva» o abrir una existente; ocupa p. ej. el 33 % y todo se reajusta como en Windows.
- Vista de TuRinconDeLectura = terminal + su web. Vista de Modelos3D = terminal + resumen de impresión en ElegooSlicer.
- Botones que llevan a otras vistas (vistas dentro de vistas) y una pestaña Resumen de acceso rápido.
- Herramientas propias de Nullraptor como componentes.

## Ya hecho (fase 1, 261 pruebas, aprobada por Sara y Óscar)

- `panel/lib/diseno.mjs` y `rutas-diseno.mjs`: `GET/PUT /api/diseno`, orden de 10 tarjetas con lista cerrada, archivo `<trabajo>/panel/diseno.json` (no entra en las copias), escritura atómica.
- Front: `panel/src/vistas/resumen/` (`registro.jsx`, `Rejilla.jsx`, `orden.js`, `tarjetas.jsx`), modo «Reordenar» con subir/bajar y guardado optimista con vuelta atrás.
- Limitación conocida: en la rejilla de 2 columnas puede quedar un hueco si una tarjeta estrecha queda sola entre anchas. Lo resuelve el motor nuevo.

## Plan de cimientos (Marcos; concepto UX de Nora; recorte de Lucía)

### Contrato de componente
Un tipo es un objeto declarativo: título, descripción, esquema de ajustes plano, ranuras de fuentes admitidas, permisos (`pty`, `red-externa`, `archivos-proyecto`; vacío = solo datos), tamaño por defecto y el componente de React. El motor pinta uniformemente los estados cargando, error y vacío y aísla cada componente con un `ErrorBoundary`. Los datos entran solo por ranuras declaradas; un componente no hace `fetch` propio. Las capacidades con recursos se piden al motor (`ctx.capacidad`) y este las cierra al desmontar. La lista de tipos para el servidor es un JSON sin React (`lib/tipos-widget.mjs`).

### Modelo de datos
`<trabajo>/panel/vistas.json`: `{version:2, inicio, vistas:[{id, nombre, raiz}]}`. Nodo contenedor `{t:'fila'|'col', peso_h, peso_v, hijos}`; hoja `{t:'w', id:'w_<hex8>', tipo, peso_h, peso_v, ajustes, fuentes}`. Pesos enteros 1–12 (los imanes 25/33/50/67/75 % de la interfaz son 3/4/6/8/9 sobre base 12). Solo cuenta el eje del padre. Móvil: una columna, sin pesos. Topes: 20 vistas, profundidad 4, 60 nodos, 30 hojas por vista, 1–6 hijos, 64 KB. Tipo `enlace` = navega a `#/v/<id>`, no incrusta. Migración: el Resumen actual pasa a ser la vista `v_resumen`; `diseno.json` se conserva sin tocar como respaldo; no se escribe al leer.

### Entregas (cada una usable sola; commit por tarea; `npm test`)
- **E1 motor mínimo, sin editor** (la próxima): `lib/arbol.mjs` (validar/normalizar con topes), `lib/tipos-widget.mjs` (los 10 tipos actuales), `lib/vistas.mjs` + `GET/PUT /api/vistas`, front `Motor.jsx` + `arbol.js` (recursivo, flex con pesos, estados uniformes, ErrorBoundary), y que el Resumen use `/api/vistas`. Una sola vista, sin enlaces ni fuentes nuevas.
- **E2 editar con botones**: mover, cambiar peso, quitar, duplicar, añadir, partir; modo Editar unificado con «Reordenar»; catálogo «+».
- **E3 varias vistas y navegación**: pestañas, `#/v/<id>`, tipo `enlace`, pila con migas.
- **E4 fuentes y ajustes**: `lib/fuentes.mjs`, `POST /api/fuentes` (tope 20, caché 2–5 s), formulario de ajustes generado del esquema.
- **E5 capacidades**: solo cuando exista un componente que las necesite, con revisión previa de Óscar.
- **E6 arrastre**: `dnd-kit/core` con zonas de soltar propias, al final y tras usar el sistema (versión y tamaño sin comprobar).

### Para Óscar, antes de cada entrega
Validación recursiva y topes (JSON hostil); un `PUT` de vistas nunca lanza procesos ni escribe fuera de `<trabajo>/panel`; los enlaces solo a vistas existentes (nunca una dirección); fuentes en lista cerrada con enumeraciones, sin cofre ni `.env`; cualquier tipo con permiso (`pty`, red, archivos) exige su aprobación para entrar en el registro. La terminal reutiliza `Remoto` (`panel/lib/remoto.mjs`, topes de sesiones y duración); la autenticación y el origen de sus rutas están sin comprobar.

### UX (Nora)
Navegación de dos niveles (pestañas = vistas raíz; una vista abre otra encima, con migas). Modo uso limpio y modo «Editar» con asas, catálogo y autoguardado; quitar con «Deshacer». Terminal: elegir repo → vacío → sesión nueva/existente → conectando → viva → muerta. Móvil: apilado, enfocar la terminal a pantalla completa, dividir y pesos «en el PC». Toda acción de arrastre con alternativa por teclado; salida clara de la terminal (Esc dos veces).

### Riesgos
Tres ejes de complejidad a la vez (árbol, enlaces, fuentes): E1 solo lleva el árbol. Lucía: no construir el editor completo antes de comprobar que se usa.

## Pendiente de decidir (Daniel)
1. Aprobar la entrega E1.
2. Si `diseno.json` queda como respaldo sin tocar (propuesta: sí).
3. Pestañas (E3): vistas del usuario junto a las secciones fijas o en su lugar.
4. Para la terminal (E5): repositorio heredado de la vista o mezclable; sesiones vivas tras cerrar la pestaña.
5. Si el copiado del orden/vistas entra en las copias de seguridad (hoy `panel/` no entra).
