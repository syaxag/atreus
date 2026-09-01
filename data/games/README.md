# Definiciones de juego

Un archivo JSON por juego. El nombre del archivo es el `id` con el `:` sustituido
por `.` — por ejemplo `steam:2379780` → `steam.2379780.json`.

Validar contra `_schema.json` antes de añadir.

## Añadir un juego nuevo

1. Copiar `steam.2379780.json` como plantilla.
2. Poner `id`, `name` y `exe` reales.
3. Si es multijugador, poner `"multiplayer": true` y **no** añadir cheats.
4. Resolver los patrones AoB con un escaneo sobre el proceso en marcha.
5. Guardar. La app recarga las definiciones al arrancar, sin recompilar.

## Ejemplos incluidos

| Archivo | Para qué sirve |
|---|---|
| `steam.2379780.json` | Plantilla completa: cheats de tipo `value` y `toggle`, mods con cargador |
| `steam.1172470.json` | Caso bloqueado: multijugador, sin cheats, solo logros |
