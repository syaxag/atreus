# Contrato IPC

El contrato son dos archivos:

- `src/shared/types.ts` — tipos de dominio (`Game`, `Achievement`, `PlatinumReport`, …).
- `src/shared/ipc.ts` — `AtreusApi`, `AtreusEvents`, `IPC_CHANNELS`, `ok()`, `err()`.

## Reglas

1. **Todo método devuelve `Result<T>`.** Nunca se lanza una excepción a través del IPC.
   `register.ts` envuelve cada handler y devuelve `err(mensaje)` si algo revienta.
2. **Los nombres de canal se derivan de la forma `dominio.metodo`.**
   `library.scan` → `ipcMain.handle('library.scan', …)`.
3. **Los eventos push usan `dominio:evento`** (dos puntos, no punto) para no
   confundirlos con los canales de invocación.
4. El renderer **nunca** importa nada de `src/main/`. Solo `src/shared/` y su propio árbol.
5. Al añadir un canal hay que tocar cuatro sitios: `IPC_CHANNELS`, la interfaz
   `AtreusApi`, `main/ipc/register.ts` y `preload/index.ts`. El arranque avisa en el
   registro si alguno queda sin cubrir, y `npm run typecheck` caza el resto.

## Dominios

| Dominio | Para qué |
|---|---|
| `library` | Detectar, listar, marcar y lanzar juegos |
| `steam` | Leer y escribir logros y estadísticas por el cliente de Steam |
| `achievements` | Logros de cualquier juego, de la tienda que sea, y el registro manual |
| `xbox` | Comprobación de la clave de OpenXBL, para leer los logros de Xbox |
| `platinum` | Informe de cuánto falta para el 100 %, y resumen de toda la biblioteca |
| `guides` | Buscar guías y traer su texto completo |
| `maps` | Localizar el mapa interactivo del juego |
| `mods` | Instalar, ordenar y desplegar mods |
| `progress` | Checklist y notas locales por juego |
| `settings`, `catalog`, `app` | Infraestructura |

## Reescritura de septiembre de 2026

El contrato dejó de estar congelado y se rehízo alrededor del platino. Lo que cambió:

**Fuera** — `trainer.*` (8 canales), `scanner.*` (10), y los eventos
`trainer:session`, `trainer:state`, `scanner:progress`, `scanner:session`. Con ellos
se fueron los tipos `CheatDef`, `CheatState`, `CheatResolve`, `MemType`,
`ScanCandidate`, `ScanSession`, `TrainerSession`, `DerivedResolve` y `AtlasMap`.

**Dentro** — `achievements.list`, `achievements.mark`, `platinum.report`,
`platinum.summaries`, `maps.list`, y `guides.list` / `guides.read` en lugar de
`guides.search` / `guides.read` / `guides.maps`.

`achievements.list` es la puerta única a los logros de un juego, y devuelve un
`AchievementSet` que dice de dónde sale lo que trae: `tracking: 'steam'` cuando manda
el cliente (y entonces `writable` es true), `'manual'` cuando la lista es la del
catálogo público de Steam y el progreso lo pone el usuario, y `'none'` cuando no hay
lista. La interfaz se apoya en ese campo en vez de mirar la plataforma, porque un juego
de Steam con el cliente cerrado cae también en `'manual'`.

**Cambios de forma en lo que se quedó:**

- `Game` gana `playtimeMinutes`. `hasDefinition` ya no significa "tiene cheats
  utilizables" sino "Atreus tiene una ficha propia de este juego".
- `Achievement` gana `globalPercent`: el porcentaje de jugadores del mundo que lo
  tiene. Lo rellena `steam/session.ts` cruzando con la API pública de rareza.
- `PlatinumReport` y `PlatinumSummary` ganan `tracking`, para que la interfaz nunca
  presente como medido un progreso que puso el usuario a mano.
- `game:stopped` lleva ahora los `minutes` que duró la sesión.
- `Settings` pierde `hotkeysEnabled` y `confirmBeforeCheats`, y gana
  `achievementRiskAccepted`.

## Segunda tanda, septiembre de 2026

**Fuera** — `license.*` (3 canales), el evento `license:updated` y los tipos
`LicenseInfo` y `LicenseTier`. Era un sistema de activación con clave firmada que no
gateaba ninguna función en una aplicación personal.

**Dentro:**

- `steam.checkKey` — comprueba la clave de la Web API contra Steam y explica el
  resultado. Existe porque una clave mal pegada o un perfil privado fallan **en
  silencio**: los logros no aparecen y no hay forma de saber por qué.
- `maps.add` / `maps.remove` — guardan un mapa a mano en la ficha del juego, en la capa
  del usuario. Es la salida para los juegos que no cubre ni MapGenie ni la wiki.
- El evento `platinum:summaries` — el cálculo en segundo plano va rellenando la
  biblioteca juego a juego, y la interfaz se entera sin preguntar.
- `InteractiveMap` gana `removable`: solo se puede quitar lo que está escrito en un
  archivo, no lo que viene de una búsqueda automática.

## Tercera tanda: logros de Xbox

**Dentro** — `xbox.checkKey`, y `Settings.xboxApiKey`.

Xbox Live no se consulta sin autenticarse. El punto medio es OpenXBL: el usuario entra
con su cuenta de Microsoft **en la web de ellos**, genera una clave y pega solo la clave.
Atreus nunca ve una contraseña, y la clave se revoca desde xbl.io cuando se quiera.

Con clave, un juego de Xbox devuelve `tracking: 'steam'` y `writable: false`: el estado
es real —con fechas y con la rareza que publica Xbox— pero Xbox Live no acepta
escrituras de terceros. Sin clave se queda como estaba, en `'manual'` sobre la lista del
catálogo público de Steam, y el aviso de la vista dice dónde está la salida.

## Cuarta tanda: la celebración del platino

**Dentro** — el evento `platinum:achieved`, que lleva el `PlatinumReport` entero del
juego recién completado.

Solo se emite para platinos **nuevos**. Los que ya tenías cuando se instaló Atreus se
apuntan en silencio durante el primer recorrido de la biblioteca: si no, al abrir la
aplicación por primera vez desfilarían seguidas las celebraciones de cosas que hiciste
hace meses. Lo lleva `platinum/celebrated.ts` con una marca de *sembrado*.

## Quinta tanda: los logros que Steam no deja tocar

**Cambia** — `steam.commit` ya no devuelve solo `{ applied }` sino
`{ applied, rejected }`, con los nombres que Steam se negó a escribir.

Hay juegos cuyos logros **solo concede el servidor de su editor**: en Steamworks se
marcan así y el cliente rechaza cualquier `SetAchievement`, venga de donde venga. En la
biblioteca de prueba le pasa a Assassin's Creed Unity y a ningún otro. Atreus lo daba
por bueno y cantaba "cambios escritos en Steam" sin que pasara nada.

Ahora la sesión lo averigua al conectar —marca un logro pendiente y lo deshace en el
acto, sin `StoreStats`, así que no se persiste nada— y el juego llega a la interfaz con
`writable: false` y una nota que lo explica. Es el mismo modo de solo lectura que ya
usaban los juegos de Xbox. Y si un guardado se acepta a medias, `rejected` permite
decirlo en vez de cantar un éxito que no ha sido.

## Cómo se implementa

```ts
// src/main/ipc/register.ts
handle('platinum.report', (gameId: string, refresh?: boolean) =>
  platinum.report(gameId, refresh === true).then(ok));
```

```ts
// src/preload/index.ts
platinum: {
  report: (gameId, refresh) => invoke('platinum.report', gameId, refresh),
  summaries: () => invoke('platinum.summaries'),
},
```

```ts
// en un componente, siempre comprobando `ok`
const res = await api.platinum.report(gameId);
if (!res.ok) { pushToast('error', res.error); return; }
setReport(res.data);
```

## El mock

`src/renderer/mock/api.ts` implementa `AtreusApi` entero con datos falsos y latencia
simulada (150-400 ms), para levantar la interfaz sin Steam ni juegos abiertos
(`npm run dev:mock`). Cubre:

- 13 juegos de varias plataformas, con horas jugadas y con uno multijugador.
- ~10 logros con rareza, ocultos y fechas de desbloqueo.
- Informes de platino calculados igual que en el backend real.
- Guías legibles y no legibles, para probar las dos ramas del lector.
- Un mapa interactivo, ~5 mods (uno con conflicto y otro en error) y perfiles.

Si el mock miente, la interfaz parece rota donde no lo está: cuando se añade un canal,
se añade también aquí.

## Verificación

`npm run typecheck` compila los dos árboles contra `src/shared/`. Es lo que caza que el
mock, el preload o una vista se hayan quedado atrás. **Ejecutarlo antes de cada commit.**
