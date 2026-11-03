# Condiciones del servicio

Borradores de las condiciones que el cliente acepta en `/aceptar/<token>`. La fuente de verdad es la tabla
`condiciones` (una fila por marca, versión e idioma; una versión publicada no se modifica nunca, lo impide un trigger).
Estos archivos son el texto de partida de cada versión: al publicar una versión nueva, se edita aquí, se crea
`<marca>-v<N+1>.md` y se inserta la fila con su OK.

- Antes de publicar la v1: rellenar los `[[Joel: …]]` y que lo revise una vez un abogado o la gestoría.
- Formato: `## títulos`, párrafos y listas con `- `. Nada más (la página pública lo pinta tal cual).
