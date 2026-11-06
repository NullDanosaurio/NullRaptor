// Diferencias de cliente: se conserva la política común y se sustituyen los mecanismos exclusivos de Claude.
import fs from 'node:fs';
import path from 'node:path';

export function adaptarInstruccionesCodex(texto) {
  return texto
    .replace(/desglósala con TodoWrite \(se ve en la terminal\)/g,
      'usa el plan nativo si está disponible; si no, muestra una lista visible y mantén su estado en Ruflo')
    .replace(/TodoWrite \+ Ruflo/g, 'plan visible + Ruflo')
    .replace(/- Opus planifica y Sonnet ejecuta \(`opusplan`\): para pensar un diseño difícil, entra en modo plan\./g,
      '- En diseños difíciles, prepara primero el plan. Usa las funciones disponibles de Codex; conserva el modelo elegido por Daniel.')
    .replace(/ábrelo con Read para verlo/g, 'ábrelo con la herramienta de imágenes disponible para verlo')
    .replace(/Grep\/Glob antes que Read/g, 'rg y rg --files antes de leer archivos completos')
    .replace(/Grep primero/g, 'rg primero')
    .replace(/Bash solo para/g, 'Ejecuta órdenes solo para')
    .replace(/Ahorra tokens: Grep\/Glob/g, 'Ahorra tokens: rg y rg --files');
}

export function instruccionesCodex(agente) {
  return adaptarInstruccionesCodex(fs.readFileSync(path.join(agente, 'config', 'claude-global.md'), 'utf8'))
    + '\n## Particularidades de Codex\n'
    + '- En cada carpeta, AGENTS.override.md tiene prioridad sobre AGENTS.md; CLAUDE.md es la alternativa si faltan ambos. '
    + 'Respeta las instrucciones de las subcarpetas; no crees copias de configuración en los proyectos.\n'
    + '- Comparte con Claude el namespace proyecto-<Proyecto> y la clave en-curso de Ruflo, y las tareas con etiqueta <Proyecto>. '
    + 'Recupera ese estado incluso al reanudar una conversación; el historial no sustituye la memoria persistente.\n'
    + '- Si falta una función nativa, usa un equivalente disponible; no finjas herramientas. '
    + 'No vuelvas a invocar Codex para escribir el código que puedes implementar directamente.\n';
}

export function perfilCodex(texto) {
  return adaptarInstruccionesCodex(texto)
    .replace(/Los invocas con la herramienta de agentes por su nombre[^\n]*/,
      'Si hay subagentes nativos, invócalos por su rol equipo-…; si no, aplica las revisiones en secuencia y explica la limitación.')
    .replace(/El código lo escribe Codex \(cuenta de ChatGPT\); Iker lo revisa\./g, 'Iker implementa directamente y revisa el código.')
    .replace(/Daniel lo aprueba\./g, 'Respeta el alcance ya autorizado por Daniel; aclara solo las decisiones pendientes.')
    .replace(/## Gasto de tokens \([^\n]+\)/, '## Gasto de tokens')
    .replace(/- Modelos:[\s\S]*?(?=\n- No relances)/,
      '- Los roles heredan el modelo de la sesión; no fuerces modelos de otro proveedor. Desarrollo implementa directamente.');
}

export function contenidoRolCodex(agente, nombre, texto) {
  if (nombre === 'equipo-desarrollo') {
    return fs.readFileSync(path.join(agente, 'config', 'codex', 'equipo-desarrollo.md'), 'utf8');
  }
  return adaptarInstruccionesCodex(texto.replace(/^---\n[\s\S]*?\n---\n/, ''))
    .replace(/^Segunda opinión opcional[^\n]*\n/gm, '');
}
