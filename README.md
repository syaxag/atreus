# Atreus

Aplicación personal de Windows para **cazar platinos**: saber qué te falta para el
100 % de logros de cada juego, cuánto te va a costar, leer las guías que lo explican y
abrir los mapas donde está cada cosa — todo dentro de la misma ventana.

Uso personal. Ver [docs/SCOPE.md](docs/SCOPE.md).

## Qué hace

| Módulo | Qué resuelve |
|---|---|
| **Biblioteca** | Detecta juegos de Steam, Epic, GOG, EA y Xbox, más ejecutables sueltos. Ordena por lo más cerca del platino, con horas jugadas y progreso reales |
| **Ficha del juego** | Cuántos logros llevas, cuánto has jugado, cuánto llevas persiguiendo el platino, cuánto te queda y cómo de duro es — con la lista de lo que falta ordenada por rareza |
| **Logros** | Funciona con juegos de cualquier tienda: progreso, rareza global de cada logro e historial. En Steam los lee y puede desbloquearlos, avisando antes de lo que eso significa; en Xbox, Epic o EA enseña la lista y llevas tú el registro |
| **Guías** | Busca solas las guías del juego y muestra su **texto completo** dentro de Atreus, con imágenes y atribución |
| **Mapas** | Abre el mapa interactivo real del juego —MapGenie o su wiki— en una pestaña integrada |
| **Mods** | Instalación desde `.zip`/`.7z`, orden de carga, perfiles, despliegue reversible por hardlink |

Todo se extiende añadiendo un JSON en [`data/games/`](data/games/) — sin recompilar.

## De dónde salen los datos

Nada de esto necesita clave de API ni cuenta:

- **Logros y sus fechas** — del cliente de Steam, con tu propia sesión. Para un juego
  de otra tienda, la lista sale del catálogo público de Steam: casi todo lo que hay en
  Xbox, Epic o EA está también ahí, y su lista de logros es la misma.
- **Rareza de cada logro** — de las estadísticas globales públicas de Steam. Es lo que
  permite decir si un platino es asequible o brutal, y qué logro es el que va a doler.
- **Horas jugadas** — del `localconfig.vdf` de tu instalación de Steam. Para las
  plataformas que no publican horas, Atreus cuenta las sesiones que ve.
- **Guías** — de la comunidad de Steam y de las wikis del juego (wiki.gg, Fandom).
- **Mapas** — del directorio público de MapGenie y, si el juego no está ahí, de su wiki.

La clave de la Steam Web API que hay en Ajustes es opcional.

## Arrancar

```bash
npm install
```

```bash
npm run dev:mock
```

`dev:mock` levanta la interfaz contra un backend falso — no necesita Steam ni juegos
abiertos. Para el backend real:

```bash
npm run dev
```

Comprobar que el contrato sigue en pie:

```bash
npm run typecheck
```

**Instalable**: `npm run dist` genera `release/Atreus-<versión>-setup.exe`. El
empaquetado no se lanza si el typecheck o las pruebas fallan.

## Qué se actualiza sin reinstalar

Juegos, mapas y proveedores de mods se añaden dejando un JSON o desde el catálogo,
**sin reempaquetar ni reiniciar**. Solo el código de la app necesita un instalador
nuevo. Los tres caminos, con su estado real, en [docs/UPDATING.md](docs/UPDATING.md).

## Estructura

```
docs/                 Arquitectura, contrato, diseño, alcance, actualizaciones
data/games/           Fichas por juego (mapas, proveedores de mods) — extensible
src/shared/           Tipos e interfaz IPC, compartidos por los dos lados
src/main/             Proceso principal: catálogo, Steam, platino, guías, mapas, mods
src/preload/          Puente contextBridge
src/renderer/         React + Tailwind
```

## Stack

Electron 33 · TypeScript · React 18 · Tailwind 3.4 · Zustand · koffi (FFI a
`steamclient.dll` y a la enumeración de procesos) · electron-vite · electron-builder.

## Créditos

El enfoque técnico del módulo de logros está inspirado en
[Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) de
Rick Gibbed (licencia zlib). El código de Atreus está escrito de cero.
