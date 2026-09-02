# Atreus — Arquitectura

## Decisión de stack

| Capa | Elección | Motivo |
|---|---|---|
| Shell | **Electron 33** | Node 24 ya instalado; sin .NET SDK en la máquina. Es la misma forma que usa WeMod |
| Lenguaje | **TypeScript** estricto | Un solo lenguaje en back y front → los dos lados comparten tipos |
| Build | **electron-vite** | HMR en el renderer, bundling de main/preload, un solo comando |
| UI | **React 18 + Tailwind 3.4** | Control total del diseño minimalista; sin librería de componentes pesada |
| Estado | **Zustand** | Mínimo, sin boilerplate |
| FFI nativo | **koffi** | Llama a `steamclient.dll` y a Toolhelp32 sin compilar addons C++ |
| Empaquetado | **electron-builder** (NSIS) | Auto-update integrado |
| Persistencia | JSON en `%APPDATA%/Atreus` | Sin base de datos; simple e inspeccionable |

**Sin .NET.** Se descartó reutilizar `SAM.API.dll` directamente porque exigiría
instalar el SDK de .NET y mantener dos runtimes. Reimplementamos su interop con koffi.

---

## Diagrama de procesos

```
┌────────────────────────────────────────────────────────────┐
│  Proceso MAIN de Electron  (Node)                          │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ catalog  │ │  steam   │ │ platinum │ │ guides/maps  │   │
│  │ playtime │ │  service │ │  report  │ │    mods      │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       │            │            │              │           │
│       └────────────┴──── IPC router ───────────┘           │
└──────────────────────────┬─────────────────────────────────┘
                           │ contextBridge (preload, typed)
┌──────────────────────────┴─────────────────────────────────┐
│  Proceso RENDERER (Chromium)                               │
│  React + Tailwind — Ficha · Logros · Guías · Mapas · Mods  │
└────────────────────────────────────────────────────────────┘
                           │ fork()
┌──────────────────────────┴─────────────────────────────────┐
│  steam-worker.js  (1 proceso POR AppID)                    │
│  SteamAppId=<id> → steamclient.dll → logros/stats          │
└────────────────────────────────────────────────────────────┘
```

El worker de Steam es **obligatoriamente un proceso aparte**: `steamclient.dll`
vincula un único AppID por proceso. Se lanza bajo demanda, se mata al cerrar el juego.

---

## Módulos del proceso main

### `services/catalog` — descubrimiento de juegos
Fuentes de juegos, todas opcionales y unificadas en un tipo `Game`:
- **Steam**: parsea `libraryfolders.vdf` → `steamapps/appmanifest_*.acf`.
- **Epic**: `C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item`.
- **GOG**: registro `HKLM\SOFTWARE\WOW6432Node\GOG.com\Games`.
- **Xbox/MS Store**: `Get-AppxPackage` vía PowerShell.
- **Manual**: el usuario añade un `.exe` a mano.

Cada juego se enriquece con la definición de `data/games/<id>.json` si existe.

### `services/steam` — reimplementación de SAM
- `steam-locator.ts` — encuentra Steam y `steamclient.dll`.
- `steam-worker.ts` — proceso hijo: koffi carga `steamclient.dll`, resuelve
  `CreateInterface` y navega las vtables de `ISteamClient` / `ISteamUserStats`.
- `schema.ts` — lee el esquema de logros. Dos vías:
  1. **Local**: `appcache/stats/UserGameStatsSchema_<appid>.bin` (sin red).
  2. **Web API**: `ISteamUserStats/GetSchemaForGame` con la API key del usuario.
- API expuesta: listar logros, alternar, escribir stats, `StoreStats`.

### `services/achievements` — los logros, venga tu copia de donde venga
`index.ts` es la puerta única: devuelve un `AchievementSet` que dice siempre de dónde
sale lo que trae. Hay dos caminos.

Con el **cliente de Steam** disponible manda él: estado real, fechas reales, y Atreus
puede escribirlo.

Sin él —un juego de Xbox, de Epic, de EA, o uno de Steam con el cliente cerrado— entra
`catalog.ts`. Steam publica en `steamcommunity.com/stats/<appid>/achievements/` la lista
completa de cualquier juego, con nombre, descripción, icono y rareza, **sin clave y sin
exigir que lo poseas**; y casi todo lo que hay en las otras tiendas está también en
Steam. Para un juego que no es de Steam se busca su AppID por el nombre en
`storesearch` y se lee esa lista. El AppID se recuerda en disco, también cuando la
búsqueda no encuentra nada: un juego que no está en Steam no lo va a estar mañana.

Lo que esa vía **no** puede saber es cuáles tienes tú: eso vive en la cuenta de cada
plataforma y no se consulta sin autenticarse. Ahí entra `manual.ts`, que guarda tus
marcas en `manual-achievements.json`. Marcar no toca la plataforma; es tu cuaderno.

`parse-stats.ts` es puro y lleva las dos decisiones delicadas: de dónde sale el
identificador estable de un logro —del hash de su icono, porque el nombre se traduce— y
cuándo un resultado de la tienda es de verdad el juego que buscas. Equivocarse ahí es
peor que no encontrar nada: enseñaría los logros de un DLC como si fueran los tuyos.

### `services/steam/webapi.ts` — el camino barato
Cuando el usuario pone su clave en Ajustes, `GetPlayerAchievements` da el estado real de
un juego en **una petición HTTP**, sin arrancar un proceso hijo. No permite escribir, así
que va por detrás del cliente y por delante del catálogo público. Es lo que hace viable
recorrer la biblioteca entera. Sin clave, sin SteamID o con el perfil en privado devuelve
null y el resto sigue su camino; `checkKey()` existe para que ese silencio se pueda
diagnosticar desde Ajustes.

### `services/platinum/warmup.ts` — rellenar la biblioteca por detrás
El informe se calculaba solo al abrir la ficha de un juego, así que la Biblioteca
arrancaba sin barras y con el orden "más cerca del platino" ordenando por nada. El
calentamiento la recorre solo, despacio, y avisa juego a juego por `platinum:summaries`.

Con clave de la Web API cada juego es una petición y basta un respiro de segundo y medio;
sin ella hay que preguntarle al cliente, que es un proceso hijo por juego, y el hueco
sube a veinte segundos. Nunca corre mientras hay una partida abierta: el informe puede
esperar, la partida no.

Y no guarda lo que no sabe: en un juego de Steam, un progreso `manual` significa que no
se pudo leer el estado, no que sea cero. Ese resumen se descarta en vez de pintar un 0/31
en un juego que llevas a medias.

### `services/achievements/rarity.ts` — rareza global
`rarity.ts` consulta `GetGlobalAchievementPercentagesForApp`, que es pública y no
lleva clave. Devuelve qué porcentaje de los jugadores del mundo tiene cada logro, y se
cachea doce horas. Es el único dato objetivo que existe para hablar de dificultad, así
que sostiene todo el informe de platino. Si Steam no responde, el informe sale igual
con `globalPercent: null` y lo dice.

### `services/playtime` — cuánto has jugado
Dos fuentes, ninguna obligatoria:
- **Steam local** — `userdata/<cuenta>/config/localconfig.vdf` guarda los minutos de
  cada AppID. Es el dato oficial y está en disco: ni clave ni conexión.
- **Sesiones propias** — el monitor de actividad apunta cuánto ha estado abierto cada
  juego en `sessions.json`. Cubre Xbox, EA y Epic, que no publican horas.

### `services/platinum` — el informe
Cruza logros, rareza, horas y sesiones y responde a la única pregunta que importa:
*¿qué me queda?*. `estimate.ts` va aparte y es **puro** —sin red ni disco— porque es la
parte que más fácil miente: un número en pantalla parece un hecho aunque sea una
corazonada. Cada logro pesa según su rareza; lo que falta se mide contra el ritmo real
del jugador, y cuando no hay ritmo con el que medir, el informe lo dice en vez de
inventarlo.

`summaries()` sirve a la biblioteca entera desde una caché en disco: pedirle al cliente
de Steam los logros de ciento cincuenta juegos abriría ciento cincuenta procesos.

### `services/guides` — guías con texto
Tres fuentes en paralelo, ordenadas poniendo delante las que se pueden leer enteras
dentro de la aplicación:
- `steam.ts` — guías de la comunidad. `browsefilter=trend` es lo que convierte la
  página en un buscador de verdad; sin ella Steam devuelve siempre el escaparate y
  `searchText` se ignora, que era por lo que las búsquedas no traían nada.
- `wiki.ts` — API de MediaWiki de wiki.gg y Fandom. JSON limpio, sin clave. El host se
  adivina del nombre del juego (`wiki-host.ts`, puro) y se comprueba una vez.
- `web.ts` — buscador genérico, solo como último recurso. Sus resultados se marcan
  como *no legibles*: prometer un texto que sale en blanco es peor que avisar.

`parse-steam.ts` y `wiki-host.ts` son puros y tienen pruebas con HTML real recortado:
si Steam cambia su plantilla, caen las pruebas antes que la aplicación.

### `services/maps` — mapas interactivos
Atreus **no dibuja el mapa**: abre el del proveedor en un `<webview>` aislado, con sus
marcadores y sus filtros. Tres fuentes, en orden: lo que declare el catálogo, el
directorio público de MapGenie (leído de su portada una vez al día) y, si no hay nada,
la página de mapas de la wiki del juego. `match.ts` es puro y empareja el nombre de la
tienda con el del directorio; solo acorta en una dirección, para que "Halo" no se lleve
el mapa de "Halo Infinite".

### `services/system` — procesos
`processes.ts` enumera los procesos con Toolhelp32. Es lo único que Atreus necesita
saber del sistema: qué juego está abierto, para contar el tiempo de sesión. No abre
procesos ajenos ni lee su memoria.

### `services/mods` — gestor de mods
- Perfiles por juego, con orden de carga.
- Instalación desde `.zip` / `.7z` a un *staging* en `%APPDATA%/Atreus/mods/<id>/`.
- Despliegue por **enlace duro** (hardlink) al directorio del juego → desinstalación limpia.
- Registro de archivos desplegados para revertir sin residuos.
- Argumentos de lanzamiento por perfil.

### `services/updater`
- App: `electron-updater`.
- **Catálogo**: `data/games/*.json` se sincroniza aparte desde un repo Git o carpeta
  local. Añadir un juego = añadir un JSON, sin release nueva.

---

## Formato de definición de juego (`data/games/<appid>.json`)

Es **el** punto de extensión. Ver `data/games/_schema.json` y el ejemplo
`2379780.json` (Balatro).

```jsonc
{
  "id": "steam:2379780",
  "name": "Balatro",
  "exe": "Balatro.exe",
  "multiplayer": false,
  "achievements": { "source": "steam" },
  "guides": {
    "maps": [
      {
        "id": "balatro-wiki",
        "title": "Balatro · comodines y mazos",
        "description": "Referencia de comodines, mazos y desbloqueos.",
        "url": "https://balatrogame.fandom.com/wiki/Jokers",
        "provider": "Wiki de Balatro"
      }
    ]
  },
  "mods": { "root": "Mods", "loader": "lovely" }
}
```

`guides.maps` solo hace falta cuando MapGenie no cubre el juego o cuando hay un mapa
mejor que el suyo: es una **dirección**, no un dibujo.

---

## Contenido en dos capas — añadir sin reempaquetar

> Resumen práctico de qué se actualiza por dónde: [UPDATING.md](UPDATING.md).

Los juegos, sus mapas y sus proveedores de mods viven **fuera** del código, en dos capas:

| Capa | Dónde | Quién la toca |
|---|---|---|
| De fábrica | `resources/data/` junto al ejecutable | La instalación; se sustituye al actualizar |
| Del usuario | `%APPDATA%/Atreus/data/` | Tú, a mano o sincronizando |

La capa del usuario **gana** cuando comparten `id`, así que se puede corregir o
ampliar un juego que ya venía sin tocar la instalación, y el cambio sobrevive a
la siguiente actualización de la app.

Va como `extraResources`, no dentro del `.asar`: dentro no se podría leer ni
sustituir sin reempaquetar, que es justo lo que queremos evitar.

**Las carpetas se vigilan.** Dejar un JSON nuevo en `%APPDATA%/Atreus/data/games`
se nota al momento: se recarga, se revalida y la biblioteca lo recoge. Sin reiniciar.

### Añadir un juego

1. Ajustes → Catálogo → **Abrir carpeta**.
2. Dejar ahí `steam.<appid>.json` siguiendo `data/games/_schema.json`.
3. Listo. Si el JSON está mal, el registro dice la línea y la columna exactas.

### Sincronizar desde fuera

`settings.catalogSource` admite:

- una **carpeta local**;
- una **URL a un `.zip`** — vale el de un repositorio de GitHub
  (`.../archive/refs/heads/main.zip`), y se recogen los `*.json` a cualquier
  profundidad;
- una **URL a un `.json`** suelto.

### Descubrimiento automático de mods

Cuando un escaneo detecta un juego que antes no estaba, Atreus consulta su
catálogo público y avisa de cuántos mods hay. No hay que buscarlos a mano.

Cada juego declara su catálogo en la definición:

```jsonc
"mods": { "provider": { "kind": "thunderstore", "community": "balatro" } }
"mods": { "provider": { "kind": "geode" } }
```

| Proveedor | API | Métrica |
|---|---|---|
| Thunderstore | `thunderstore.io/c/<comunidad>/api/v1/package/` | descargas |
| Geode | `api.geode-sdk.org/v1/mods` | descargas |
| GameBanana | `gamebanana.com/apiv11/Game/<id>/Subfeed` | me gusta |

Un juego puede tener **varios** catálogos: son comunidades distintas con
contenido distinto. Si uno falla, se sigue con los demás.

| Juego | Catálogos | Mods |
|---|---|---|
| PEAK | Thunderstore | 1.910 |
| Geometry Dash | Geode + GameBanana | 278 |
| Balatro | Thunderstore + GameBanana | 204 |
| Resident Evil 4 | GameBanana | 24 |
| DOOM: The Dark Ages | — | aún no hay escena de modding |
| Halo: Campaign Evolved | — | no está en ningún catálogo con API |
| KovaaK's · Wallpaper Engine | — | usan Steam Workshop, que gestiona Steam |

**Cada catálogo mide la popularidad a su manera.** Thunderstore y Geode publican
descargas; GameBanana, "me gusta". Llamarlo todo "descargas" sería mentir, así
que cada mod dice qué es su número.

**Descargas diferidas.** GameBanana no da la URL en el listado. Pedirla para los
148 mods de un juego serían 148 peticiones, así que los mods salen marcados como
`deferred` y la URL se resuelve solo la del que se instala.

Instalar desde el catálogo baja el archivo a un temporal y lo pasa por el mismo
`install` de siempre, así que hereda la protección contra zip slip, la lectura
del manifiesto y la decisión de extraer o dejar el paquete entero.

### Algunos mods son en realidad menús de trucos

Atreus ya no trae motor de cheats, pero sí dice de qué tipo es cada cosa antes de
instalarla: algunos catálogos publican como mod lo que es un menú de trucos o un modo
debug, y quien va a por un platino merece saberlo.

`mods/classify.ts` los separa por señales en el nombre, la descripción y las
categorías: una señal fuerte (`mod menu`, `trainer`, `god mode`) basta; dos medias
también; y cualquier desmentido (`texture`, `skin`, `anti-cheat`) lo tumba, porque es
preferible etiquetar de menos que anunciar un paquete de texturas como truco.

### Mods

Los mods ya vivían fuera del paquete: se instalan en
`%APPDATA%/Atreus/mods/<gameId>/` y se despliegan por enlace duro. Instalar uno
nuevo nunca ha requerido reempaquetar nada.

---

## Persistencia (`%APPDATA%/Atreus/`)

```
settings.json          preferencias, API key de Steam, rutas
library.json           caché del escaneo de juegos
data/games/*.json      fichas de juego del usuario — mandan sobre las de fábrica
data/catalog.json      marca de la última sincronización
sessions.json          minutos que Atreus ha visto abierto cada juego
progress/<id>.json     checklist y notas locales por juego
backups/<appid>/       copias del estado de logros antes de cada escritura
profiles/<id>.json     perfiles de mods por juego
mods/<id>/             staging de mods
cache/platinum.json    último informe de cada juego, para la biblioteca
cache/mapgenie.json    directorio de juegos con mapa, refrescado a diario
cache/icons/<appid>/   iconos de logros convertidos a PNG
logs/
```
