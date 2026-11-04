---
name: nullraptor-herramienta
description: Crear o cambiar una herramienta propia de Nullraptor (servidor MCP en $TRABAJO_DIR/herramientas/<id>, ficha herramienta.json, variables del cofre, aprobación en el panel). Úsala cuando Daniel pida una herramienta nueva o una tarea la necesite.
---

# Crear una herramienta propia

Cuando Daniel pida una herramienta nueva (o una tarea la necesite y él esté de acuerdo):

- Créala en `$TRABAJO_DIR/herramientas/<id>/` (`id` en minúsculas, números y guiones), nunca dentro de un proyecto.
- Ficha `herramienta.json`:
  `{ "nombre": "…", "descripcion": "…", "tipo": "mcp", "mcp": { "script": "servidor.mjs", "args": [], "variables": [{ "nombre": "X_CLAVE", "obligatoria": true, "secreta": true }] } }`
  (`args` y `variables` son opcionales).
- El script es un servidor MCP por stdio en Node (`.mjs`), dentro de su carpeta; arranca con la carpeta como
  directorio actual. Dependencias en su propia carpeta (`npm install --save-exact`) o, mejor, ninguna.
- Claves y tokens: decláralos en `variables` y pide a Daniel que los añada al cofre; nunca los escribas en archivos.
  Las credenciales del agente (`GITHUB_*`, `CLAUDE_*`, `ANTHROPIC_*`, `OPENAI_*`, `AGENTE_*`…) no se entregan.
- Comprueba que arranca y responde (p. ej. `initialize` y `tools/list` por stdin) antes de darla por hecha.
- Queda **propuesta**: dile a Daniel que la revise y apruebe en el panel → Herramientas. Llega a las sesiones que se
  abran después, no a la actual. No intentes aprobarla tú (ni la API del panel ni `~/.nullraptor`).
- Cualquier cambio posterior la para hasta que Daniel la vuelva a aprobar: avísale cuando la cambies.
