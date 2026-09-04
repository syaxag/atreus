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

### `services/xbox` — logros de Xbox, con tu estado
`parse.ts` es puro y **deliberadamente tolerante**: la misma API devuelve los logros en
dos formas según el endpoint —una corta con `isUnlocked`, y la de Xbox Live con
`progressState` y `progression.timeUnlocked`— y el envoltorio `content` unas veces está
y otras no. Se aceptan todas, porque fallar aquí deja un juego entero sin logros y sin
explicación. Las pruebas usan las respuestas del OpenAPI que publica el propio servicio
(`api.xbl.io/swagger.json`), no ejemplos inventados.

El emparejado juego ↔ título exige el nombre exacto una vez normalizado, igual que con
la tienda de Steam. Al escribir las pruebas apareció que la regla laxa que había dejado
permitía que "Halo" se llevase los logros de "Halo Infinite"; se quitó de los dos sitios.

### `services/steam/webapi.ts` — el camino barato
Cuando el usuario pone su clave en Ajustes, `GetPlayerAchievements` da el estado real de
un juego en **una petición HTTP**, sin arrancar un proceso hijo. No permite escribir, así
que va por detrás del cliente y por delante del catálogo público. Es lo que hace viable
recorrer la biblioteca entera. Sin clave, sin SteamID o con el perfil en privado devuelve
null y el resto sigue su camino; `checkKey()` existe para que ese silencio se pueda
diagnosticar desde Ajustes.

### `services/platinum/celebrated.ts` — que la fiesta sea de lo nuevo
Lleva la cuenta de qué platinos ya se han celebrado, con una marca de *sembrado* que se
cierra al terminar el primer recorrido de la biblioteca. Los platinos que ya tenías se
apuntan callados durante esa pasada; a partir de ahí, cualquiera nuevo emite
`platinum:achieved` y dispara la celebración.

El calentamiento recalcula además los juegos a los que has jugado después del último
cálculo y que aún no estaban completos. Sin eso, un platino rematado jugando no se
notaría hasta abrir su ficha a mano, y la celebración no saltaría al volver a la
aplicación, que es justo cuando tiene que saltar. Al cerrarse un juego se fuerza también
el recálculo de ese informe.

### `services/platinum/warmup.ts` — rellenar la biblioteca por detrás
El informe se calculaba solo al abrir la ficha de un juego, así que la Biblioteca
arrancaba sin barras y con el orden "más cerca del platino" ordenando por nada. El
calentamiento la recorre solo, despacio, y avisa juego a juego por `platinum:summaries`.

**Nunca abre el cliente de Steam.** Lo hizo, y el precio no se había medido: cada
juego es un proceso hijo con su AppID, y arrancar la aplicación anunciaba en Steam que
estabas jugando a los quince juegos de la biblioteca, uno detrás de otro. Peor: con esa
sesión abierta Steam cree que el juego ya está en marcha e ignora `steam://rungameid`,
así que el botón de Jugar no hacía nada.

Un resumen más preciso no vale eso. Con clave de la Web API cada juego es una petición
HTTP y sale completo; sin ella la biblioteca se rellena con lo que sabe el catálogo
público y el progreso real aparece al abrir la ficha, donde una sesión sí se espera
porque la ha pedido el usuario. Nunca corre mientras hay una partida abierta: el informe
puede esperar, la partida no.

Y quien abre una sesión de paso la cierra. `platinum.build()` suelta la que abrió —solo
la suya: si Trofeos la tenía puesta, es porque la necesita para escribir— y `launch()`
cierra la del juego antes de pedirle a Steam que arranque.

Y no guarda lo que no sabe: en un juego de Steam, un progreso `manual` significa que no
se pudo leer el estado, no que sea cero. Ese resumen se descarta en vez de pintar un 0/31
en un juego que llevas a medias.

Recalcula tres cosas: lo que no se ha calculado nunca, lo que has jugado desde el último
cálculo sin llegar al 100 %, y **lo que se guardó con una versión anterior del resumen**
(`schema`). Lo tercero existe porque el resumen fue creciendo: sin ello, lo que aprendió
a guardar después solo aparecería en los juegos que volvieras a tocar, y una función
nueva saldría en tres juegos de dieciséis.

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

El resumen no es solo lo justo para ordenar: lleva además con qué **decidir** —la
dificultad, el siguiente logro, el más raro que ya tienes, el último desbloqueo y los
días con actividad—, y todo eso se recorta del informe al guardarlo. Por eso la Portada,
el Perfil y la tarjeta de la Colección no abren una sola sesión de Steam: lo que enseñan
ya estaba calculado.

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
- **App**: `electron-updater`, apuntando por defecto a las releases del repositorio.
  El ajuste viene vacío porque vacío ya significa "las oficiales".
- **Catálogo**: `data/games/*.json` se sincroniza aparte, y también por defecto.
  Añadir un juego = añadir un JSON y `npm run catalog`, sin release nueva.

Son dos caminos distintos a propósito: el contenido se mueve todos los días y el
programa no. Ver `docs/UPDATING.md`.

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

### Sincronizar desde fuera — el catálogo compartido

`settings.catalogSource` **viene vacío, y vacío significa el catálogo oficial**:

```
https://raw.githubusercontent.com/syaxag/atreus/master/data/catalog.json
```

Es lo que convierte "añadir un juego" en algo que le llega a todo el mundo sin que
nadie reinstale nada. El mecanismo existía desde hacía meses y no tenía dirección:
estaba hecho y cada usuario tenía que pegar una URL que no le había dado nadie. La
misma historia que el actualizador.

El catálogo es un manifiesto `atreus.catalog/v1` con la URL y el **SHA-256** de cada
ficha, generado por `npm run catalog` desde `data/games/`. Atreus se baja solo las que
cambiaron y comprueba el hash antes de adoptar ninguna, así que una definición no puede
cambiar por el camino sin que se note. Y va contra `master` a propósito: el catálogo
tiene que poder adelantarse a las versiones de la aplicación.

Dos cosas que solo se vieron arrancando la aplicación con la carpeta vacía, y que
ningún test unitario podía ver:

- **El nombre viaja aparte del contenido.** Antes lo descargado pasaba por un archivo
  temporal y se adoptaba desde ahí, así que se guardaba como
  `atreus-definition-<azar>-steam.1234.json`. Como el azar cambia en cada pasada, cada
  seis horas se creaba una copia nueva de cada ficha en lugar de actualizar la que ya
  estaba.
- **El hash se saca de lo que se va a servir, no del archivo del disco.**
  `.gitattributes` guarda con LF y Windows saca CRLF al descargar: son bytes distintos
  y hashes distintos.

Sigue admitiendo, para quien quiera otro origen:

- una **carpeta local**;
- una **URL a un `.zip`** — vale el de un repositorio de GitHub
  (`.../archive/refs/heads/main.zip`), y se recogen los `*.json` a cualquier
  profundidad;
- una **URL a un `.json`** suelto o a otro manifiesto.

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

## Qué comprueba cada cosa

Tres alturas, y cada una ve lo que las otras no.

| Comando | Qué caza | Tarda |
|---|---|---|
| `npm run typecheck` | contratos entre procesos, claves de traducción que falten, y los propios tests | segundos |
| `npm test` | aritmética, parsers, disco, la prosa del renderer y las vistas pintadas contra jsdom | ~3 s |
| `npm run smoke` | que la aplicación arranque, se recorra entera y persista de verdad | ~3 min |

Del renderer se prueban dos cosas distintas.

**Su lógica**, que por eso vive fuera de los `.tsx`: `lib/format.ts` (fechas y
números, que siguen al idioma), `lib/perfil.ts` (las cuentas del Perfil,
incluida la racha), `lib/platino.ts`, `lib/aviso.ts` y `lib/contenido.ts` (la
prosa que antes venía hecha del backend). Una vista que necesite una cuenta la
saca a un módulo; ahí se prueba, y de paso deja de estar duplicada entre vistas.

**Y las vistas pintadas**, contra jsdom (`test/dom.ts`). Ahí entra solo lo que
no ve nadie más: los estados límite —una biblioteca sin nada calculado, una
lista vacía— y el comportamiento de un diálogo, incluido que Escape lo cierre.
Ni estilos ni maquetación: jsdom no aplica CSS, así que un test que buscara
«PLATINOS» estaría comprobando la hoja de estilos y no el contenido. Para ver
si algo se ve bien está abrir la aplicación.

Todo eso necesita `test/resolver.mjs`, que hace tres cosas que en producción
hacen Vite y el compilador: resolver los alias `@/` y `@shared/`, completar las
extensiones que el proyecto no escribe, y traducir el JSX con esbuild —que ya
venía con Vite—. Las imágenes y los vídeos que importa una vista se sustituyen
por una cadena: lo que se prueba no es la carátula. **El que se adapta es el
arnés, no lo que se publica.**

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
platinum.json          resumen de cada juego, para la Colección, la Portada y el Perfil
cache-atreus/mapgenie.json   directorio de juegos con mapa, refrescado a diario
cache-atreus/icons/<appid>/  iconos de logros convertidos a PNG
cache-atreus/covers/         carátulas descargadas
logs/
```

### Por qué la carpeta se llama `cache-atreus` y no `cache`

Se llamaba `cache`, y Chromium guarda lo suyo en `<userData>/Cache`, que en
Windows **es la misma carpeta**. Chromium borra los archivos sueltos que no
reconoce de su directorio y respeta las subcarpetas, así que `platinum.json`,
`guides.json`, `mapgenie.json` y `steam-appids.json` desaparecían en cada
arranque mientras `covers/` e `icons/` sobrevivían.

No daba ningún error: el efecto era que el calentamiento rehacía la biblioteca
entera cada vez que abrías Atreus —quince juegos en lugar de tres— y que «la
primera vez tarda» era todas las veces. Se vio poniendo un archivo marcador en
esa carpeta y comprobando que desaparecía solo.

`platinum.json` además se subió a la raíz: no es una caché. No se vuelve a
descargar, se recalcula abriendo un proceso de Steam por juego.

Lo vigila `npm run smoke`, que comprueba que ningún archivo de Atreus acabe en
una carpeta con `Cache_Data` dentro. Esa comprobación es de **disposición**, no
de supervivencia, y el motivo importa: Chromium limpia cuando le toca, no en
cada arranque, así que reiniciar dos veces daba verde con el fallo puesto.

Leer y escribir ese archivo vive en `summaries.ts`, **sin tocar Electron**, por
lo mismo que `estimate.ts` vive aparte: para poder probarlo. Ahí se comprueba
con archivos de mentira en un directorio temporal que lo guardado se relee,
que lo escrito por una versión anterior se completa al leerlo, y que un archivo
ilegible se aparta como `.roto` en vez de llevarse por delante la biblioteca
entera en silencio, que es lo que hacía.
