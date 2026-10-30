# Prueba de implementación, pruebas y revisión

Ejercicio separado del alcance de la futura web. Su objetivo es demostrar que los agentes trabajan y que el coordinador comprueba resultados reales.

## Contrato

Implementar `slugify(value)` en `src/slug.mjs`: aceptar solo cadenas; normalizar acentos mediante NFD y eliminar marcas combinantes; convertir a minúsculas; sustituir grupos de caracteres que no sean ASCII a-z o 0-9 por un guion; quitar guiones iniciales y finales. Rechazar otras entradas con TypeError. No añadir dependencias.

## Flujo

1. Requiere un commit inicial autorizado para crear un worktree.
2. Un worktree aislado para Codex; solo puede editar `src/slug.mjs`.
3. El coordinador ejecuta build y tests sin confiar en la descripción del agente.
4. Claude revisa el archivo y el contrato con acceso de lectura; emite un JSON con `approved` e `issues`.
5. Si fallan pruebas o revisión, devuelve el diagnóstico a Codex, con un máximo de tres intentos.
6. Solo integra el archivo si pasan todos los controles y el archivo de destino no cambió desde que comenzó la ejecución.
7. Conserva logs y hashes en `$TRABAJO_DIR/flujo/<proyecto>/runs`. No crea commits adicionales ni publica nada.

Las reglas de archivos y herramientas reducen el alcance de esta prueba; no representan un aislamiento infalible. No se pasan claves API a los procesos: utilizan sus sesiones de suscripción existentes.
