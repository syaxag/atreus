# Atreus

Aplicación personal de Windows para **cazar platinos**: saber qué te falta para el
100 % de logros de cada juego, cuánto te va a costar, leer las guías que lo explican y
abrir los mapas donde está cada cosa — todo dentro de la misma ventana.

Uso personal. Ver [docs/SCOPE.md](docs/SCOPE.md).

## Qué hace

| Módulo | Qué resuelve |
|---|---|
| **Colección** | Detecta juegos de Steam, Epic, GOG, EA y Xbox, más ejecutables sueltos. Ordena por lo más cerca del platino, con horas jugadas y progreso reales |
| **Ficha del juego** | Cuántos logros llevas, cuánto has jugado, cuánto llevas persiguiendo el platino, cuánto te queda y cómo de duro es — con la lista de lo que falta ordenada por rareza. Al llegar al 100 %, el trofeo preside la tarjeta |
| **Celebración** | Cuando rematas un platino y vuelves a la aplicación, salta la celebración: la animación del trofeo de Atreus, el nombre del juego y lo que te costó |
| **Trofeos** | Funciona con juegos de cualquier tienda: progreso, rareza de cada logro e historial. En Steam los lee y puede desbloquearlos, avisando antes de lo que eso significa; en Xbox los lee con tu clave de OpenXBL; en Epic o EA enseña la lista y llevas tú el registro |
| **Rutas** | Busca solas las guías del juego y muestra su **texto completo** dentro de Atreus, con imágenes y atribución |
| **Atlas** | Abre el mapa interactivo real del juego —MapGenie o su wiki— en una pestaña integrada. Lo que marcas en el mapa se queda marcado, y la pestaña no carga los marcos de anuncios que hacen que esas webs tarden medio minuto |
| **Taller** | Instalación desde `.zip`/`.7z`, orden de carga, perfiles, despliegue reversible por hardlink |

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

Para los juegos de **Xbox** hay una segunda clave, la de [OpenXBL](https://xbl.io):
la generas entrando con tu cuenta de Microsoft en su web y Atreus solo maneja la clave,
nunca tu contraseña. Con ella los logros de Xbox se leen solos, con sus fechas y su
rareza; sin ella se usa la lista de la versión de Steam y el progreso lo marcas tú.

La clave de la Steam Web API que hay en Ajustes es opcional, pero merece la pena: con
ella Atreus lee el progreso de toda la biblioteca en una petición por juego, en vez de
abrir un proceso de Steam por cada uno. Hay un botón para comprobarla, porque una clave
mal pegada o un perfil privado fallan sin decir nada.

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
scripts/              Herramientas: icono, trofeo, manifiesto de versiones
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
