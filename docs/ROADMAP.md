# Atreus — Roadmap de construcción (dos sesiones en paralelo)

> **Nota:** «Lado A» y «Lado B» son solo un reparto de carpetas para construir la app
> más rápido con dos sesiones a la vez. **La app en sí no tiene agentes ni IA dentro**:
> es un launcher de escritorio normal.

## Regla de oro del paralelismo

**`src/shared/` es el contrato y ya está congelado.**
Ningún lado lo modifica sin avisar al otro. Todo lo demás está separado por carpetas
que **no se solapan**, así que los dos lados pueden escribir a la vez sin conflictos.

| | Lado A — *Backend* | Lado B — *Interfaz* |
|---|---|---|
| Escribe en | `src/main/**`, `src/preload/**`, `data/**` | `src/renderer/**` |
| Nunca toca | `src/renderer/**` | `src/main/**`, `src/preload/**` |
| Compartido (solo lectura) | `src/shared/**` | `src/shared/**` |
| Se desbloquea con | koffi + Win32 + Steam | `src/renderer/mock/` (backend falso) |

El **mock** (`src/renderer/mock/api.ts`) implementa `AtreusApi` completo con datos de
mentira. El Lado B desarrolla la UI entera contra el mock desde el minuto 0 y nunca
espera al Lado A. Al final se cambia una línea (`USE_MOCK = false`) y todo encaja.

---

## FASE 0 — Cimientos ✅ HECHO

Ya está en el repo:
- Estructura de carpetas, `package.json`, `electron.vite.config.ts`, `tsconfig`.
- **Contrato IPC congelado** (`src/shared/ipc.ts`, `src/shared/types.ts`).
- Tokens de diseño (`src/renderer/styles/theme.css`).
- Esquema de definición de juego (`data/games/_schema.json`) + ejemplo Balatro.
- Documentación: `RESEARCH.md`, `ARCHITECTURE.md`, `CONTRACT.md`, `DESIGN.md`, `SCOPE.md`.

**Único paso manual antes de arrancar:**

```bash
npm install
```

---

## FASE 1 — Esqueleto vivo ✅ HECHO

Verificado: `npm run typecheck` sin errores, `electron-vite build` completo,
la app arranca con **42/42 canales registrados** y las cinco vistas navegan.

### Lado A — backend ✅
1. ✅ `src/main/index.ts` — ventana frameless 1200×760, tray, instancia única.
2. ✅ `src/main/ipc/register.ts` — los 42 canales. `settings.*` y `app.*` reales;
   el resto devuelve un error con el nombre de la fase que los implementará.
3. ✅ `src/preload/index.ts` — `contextBridge` con `AtreusApi` completo y
   suscripción a eventos restringida a los canales del contrato.
4. ✅ `services/settings` — escritura atómica, mezcla con defaults al actualizar.
5. ✅ `logger.ts` — a `%APPDATA%/Atreus/logs/main.log` con rotación a 2 MB.
6. ✅ `paths.ts` — `Atreus-dev` en desarrollo para no ensuciar los datos reales.
7. ✅ `services/steam/worker.ts` — esqueleto del proceso satélite con su protocolo.

### Lado B — interfaz ✅
1. ✅ `main.tsx` + `App.tsx` + `store.ts` (Zustand, con actualizaciones optimistas).
2. ✅ Barra de título propia con arrastre y los tres botones de ventana.
3. ✅ Sidebar de 5 secciones con indicador de "juego en contexto".
4. ✅ `lib/api.ts` — cambia entre mock e IPC real; avisa si falta el preload.
5. ✅ `mock/api.ts` — `AtreusApi` entero, con latencia simulada y bus de eventos.
6. ✅ Primitivas: `Button`, `Toggle`, `Slider`, `Input`, `Card`, `Badge`,
   `Skeleton`, `Empty`, `ViewHeader`, `Toaster`.
7. ✅ Las cinco vistas ya funcionan contra el mock, adelantando parte de las
   fases 2 a 5: biblioteca con filtros, logros con banda de cambios pendientes,
   cheats agrupados con estado de attach y bloqueo, mods con orden y perfiles,
   y ajustes completos.

**Punto de sincronía 1 superado.** Lo que queda de las fases 2-5 es sustituir el
mock por servicios reales; la interfaz ya está en su sitio.

---

## FASE 2 — Biblioteca de juegos ✅ LADO A HECHO

Verificado sobre la biblioteca real: **16 juegos** (12 de Steam en 3 bibliotecas,
1 de Epic, 3 de Xbox), definiciones aplicadas y bloqueo correcto en los 5 títulos
multijugador de las tres plataformas.

### Lado A — backend ✅
1. ✅ `catalog/vdf.ts` — parser propio de KeyValues, probado contra los archivos reales.
2. ✅ `catalog/steam.ts` — `libraryfolders.vdf` + `appmanifest_*.acf` en todas las
   bibliotecas, detección de Steam por registro, filtro de redistribuibles,
   `guessExe()` para el trainer.
3. ✅ `catalog/others.ts` — Epic (manifiestos `.item`), GOG (registro) y Xbox.
   El de Xbox lee `MicrosoftGame.config` y descarta los stubs de DLC:
   sin ese filtro entraban 13 entradas basura en vez de 3 juegos.
4. ✅ `catalog/definitions.ts` — carga `data/games/*.json` y aplica la lista de
   bloqueo. Steam cruza por AppID; el resto por nombre normalizado, porque Epic
   y Xbox no comparten identificador.
5. ✅ `catalog/index.ts` — unifica, cachea en `library.json`, emite progreso,
   favoritos persistentes, alta manual y lanzamiento por plataforma.
6. ✅ `protocol.ts` — esquema propio `atreus://cover/<id>` para servir las
   carátulas locales al renderer sin abrirle `file://`. Probado de punta a punta.
7. ✅ Los 7 canales de `library.*` conectados.

**Pendiente del Lado B:** la interfaz de biblioteca ya existe y consume estos
canales; queda pulir estados y filtros contra datos reales.

### Lado B — interfaz
1. **Vista Biblioteca**: grid de carátulas, hover con acciones rápidas.
2. Búsqueda instantánea + filtros (plataforma, favoritos, "tiene cheats", instalado).
3. Barra de progreso del escaneo consumiendo `library:scan-progress`.
4. **Vista Detalle de Juego**: cabecera + pestañas *Logros / Mods / Cheats*.
5. Estados vacíos y de carga bien resueltos (no spinners genéricos).

**Punto de sincronía 2:** `USE_MOCK = false` para `library.*`. La biblioteca real funciona.

---

## FASE 3 — Logros y estadísticas (el SAM) ✅ LADO A HECHO

Verificado contra la biblioteca real: DOOM **29/38** logros con fechas correctas,
Geometry Dash **420/547**, Balatro 0/31. Escritura probada con un ida y vuelta que
reescribe los mismos valores: 5/5 aplicadas, `StoreStats` correcto, 0 datos alterados.

### El riesgo de las vtables quedó eliminado

El plan original era cargar `steamclient.dll` y navegar vtables, como hace SAM.
Al inspeccionar las DLL disponibles apareció una vía mucho mejor: `steam_api64.dll`
expone la **API plana** (`SteamAPI_ISteamUserStats_*`), que son funciones exportadas
normales. Sin índices de vtable no hay nada que se rompa al actualizar Steam, así
que `data/steam-interfaces.json` ya no hace falta.

### Lado A — backend ✅
1. ✅ `steam/pe.ts` — lector de la tabla de exports de un PE. **Imprescindible:**
   cada juego trae la DLL del SDK con el que se compiló y no todas valen. De las
   10 copias de esta máquina, 2 se descartan (Apex y Rocket League no exponen el
   accessor de `ISteamUserStats`) y solo 1 tiene `SteamAPI_InitFlat`.
2. ✅ `steam/locator.ts` — elige la DLL **por capacidades**, no por fecha; detecta
   Steam, si está corriendo y el SteamID activo.
3. ✅ `steam/binkv.ts` — parser del KeyValues **binario** de Valve.
4. ✅ `steam/schema.ts` — lee `UserGameStatsSchema_<appid>.bin`. De ahí salen las
   estadísticas, porque la API plana sabe enumerar logros pero **no** estadísticas.
   Textos localizados: los logros salen en español. Sin clave de Web API.
5. ✅ `steam/worker.ts` — proceso satélite por AppID, con `InitFlat` o `Init` según
   lo que exporte la DLL, bombeo de callbacks y protocolo JSON por líneas.
6. ✅ `steam/session.ts` — gestor de sesiones: arranque, timeouts, reintentos,
   cierre limpio y estados que no se pisan entre sí.
7. ✅ `steam/png.ts` — codificador PNG mínimo. Steam entrega los iconos como RGBA
   en crudo; se convierten, se cachean en disco y se sirven por `atreus://icon/`.
   25 PNG generados y validados (firma, chunks, CRC y scanlines).
8. ✅ Los 6 canales de `steam.*` conectados.

### Lado B — interfaz ✅
Las vistas de Logros y Estadísticas ya estaban hechas en la FASE 1. Rematadas
después: **lista virtualizada** (Geometry Dash tiene 547 logros y pintarlos todos
daba tirones) e **iconos** desde la caché, en gris cuando el logro está bloqueado.

## FASE 4 — Motor de cheats (el trainer) ✅ LADO A HECHO

Verificado contra un proceso de destino creado a propósito, no contra un juego:
escaneo AoB, lectura, escritura y reescritura confirmadas de punta a punta.
La barrera bloquea correctamente los títulos multijugador.

### Lado A — backend ✅
1. ✅ `trainer/guard.ts` — **dos barreras**. La primera por el juego, antes de
   tocar ningún proceso; la segunda por el proceso ya localizado, abortando si
   detecta un módulo anti-cheat cargado. Cubre el caso de un título que añade
   modo online sin que la lista se haya puesto al día. No es configurable.
2. ✅ `trainer/win32.ts` — Toolhelp32 para procesos y módulos, `OpenProcess`,
   `ReadProcessMemory`, `WriteProcessMemory` y `VirtualQueryEx`. Salta las
   páginas con `PAGE_GUARD`: tocarlas lanza una excepción en el juego.
3. ✅ `trainer/memory.ts` — lectura y escritura de los 11 `MemType`, con
   saturación al rango en vez de excepción.
4. ✅ `trainer/scanner.ts` — AoB con comodines `??`, por trozos de 4 MB con
   solape para no cortar patrones a caballo entre dos lecturas.
5. ✅ `trainer/resolve.ts` — las tres formas: `aob`, `pointer` (cadena
   multinivel) y `static`.
6. ✅ `trainer/index.ts` — sesiones, congelado a 60 ms, vigilancia del proceso
   (si el juego cierra, se suelta solo), hotkeys globales y **restauración de
   los parches al desenganchar**: dejar un juego con bytes modificados es peor
   que no haberlo tocado.
7. ✅ Los 8 canales de `trainer.*` conectados.

### El fallo de diseño que encontró la prueba

La primera versión del escáner devolvía la **primera** coincidencia. La prueba
lo destapó: la firma buscada aparecía 3 veces en el proceso y el escáner apuntaba
a la copia equivocada, así que la escritura no llegaba a su sitio.

Un patrón que coincide en varios sitios no identifica nada, y elegir el primero
apunta el cheat a una dirección arbitraria. Ahora `scanModule` devuelve **todas**
las coincidencias y `resolve.ts` rechaza el patrón con un mensaje que pide
afinarlo. Es preferible un cheat que no arranca a un cheat que escribe a ciegas.

### Lado B — interfaz ✅
La vista de Cheats ya estaba hecha en la FASE 1 y consume estos canales sin
cambios: tarjetas por grupo, los tres tipos de control, estado de attach y el
estado bloqueado con su explicación.

## FASE 5 — Gestor de mods ✅ LADO A HECHO

Verificado con 20 comprobaciones sobre un juego de prueba creado a propósito:
instalación, metadatos, conflictos, despliegue, purga, zip slip y desinstalación.

### Lado A — backend ✅
1. ✅ `mods/store.ts` — staging en `%APPDATA%/Atreus/mods/<gameId>/`, con
   `index.json`, `deployed.json` y `profiles.json`. Escrituras atómicas.
2. ✅ `mods/archive.ts` — `.zip` con yauzl, `.7z` y `.rar` con `7za`. Aplana la
   carpeta envoltorio sobrante y **rechaza las entradas que se salen del
   destino** (zip slip): un `.zip` descargado puede traer `../../windows/...`.
3. ✅ `mods/detect.ts` — deduce nombre, versión y autor de los manifiestos
   habituales (`manifest.json`, `thunderstore.toml`, `modinfo.json`…) y, si no
   hay ninguno, del nombre del archivo.
4. ✅ `mods/deploy.ts` — despliegue por **enlace duro** (copia si el juego está
   en otra unidad), con registro de todo lo escrito y **respaldo de los archivos
   propios del juego** que se pisen. Purgar los devuelve y retira las carpetas
   que queden vacías: el juego vuelve exactamente a como estaba.
5. ✅ Orden de carga real: el último gana en caso de conflicto.
6. ✅ `mods/index.ts` — perfiles, activación y los 11 canales de `mods.*`.

### Raíz de despliegue

No todos los mods van al directorio del juego. `mods.root` en la definición
admite variables de entorno, así que Balatro puede apuntar a
`%APPDATA%\Balatro\Mods` mientras otro juego usa una subcarpeta suya.

### Dos fallos que destapó la prueba

- **La versión se perdía.** `OtroMod v2.1.zip` se leía como "OtroMod v2 1" sin
  versión: se normalizaban los separadores *antes* de buscar el número. Ahora la
  versión se extrae del nombre crudo.
- **Las carpetas vacías no se retiraban.** `rmSync` sobre un directorio exige
  `recursive`, así que lanzaba y el `catch` se lo tragaba en silencio. Se cambió
  a `rmdirSync`, que además no puede llevarse por delante contenido ajeno.

### Lado B — interfaz ✅
La vista de Mods ya estaba hecha en la FASE 1 y consume estos canales sin
cambios: lista ordenable, toggles, badges de estado y conflicto, Desplegar y
Purgar. Queda por conectar el selector de perfiles, que hoy solo se muestra.

## Corrección de fallos de interfaz ✅ HECHO

Pasada de auditoría sobre el renderer, verificada en el navegador contra el mock.

| Fallo | Qué pasaba | Arreglo |
|---|---|---|
| **Recargas en cascada** | Los efectos dependían del objeto `game`, que se reconstruye con cualquier cambio de la biblioteca. Marcar un favorito reabría la sesión de Steam y releía los 547 logros | Dependen de `game.id` |
| **Procesos huérfanos** | Cada juego visitado dejaba vivo su proceso satélite de Steam | Se cierra la sesión al salir de la vista |
| **Campos numéricos inservibles** | En Estadísticas no se podía borrar el campo para teclear otro número: al quedar vacío se descartaba y volvía al valor original | Borrador de texto en crudo que solo pasa al parche cuando es un número |
| **Fila de estadísticas rota** | No se veían ni el nombre ni el `apiName`: `Input` llevaba `w-full` en su base y el `w-36` del llamante no ganaba | El ancho lo fija quien usa el componente |
| **Badges partidos** | "solo incrementa" se partía en dos líneas y descuadraba la fila | `whitespace-nowrap` y `shrink-0` |
| **HTML inválido** | Las tarjetas de juego eran un `<button>` con `<div role="button">` dentro. Rompía la navegación por teclado | Tarjeta como `div` con rol y teclado propio; acciones como `<button>` reales |
| **Barra de progreso falsa** | Se calculaba sobre el total actual de la biblioteca, que no es el total del escaneo | Avanza por fase completada |
| **"pid 0"** | Steam, Epic y Xbox se lanzan por URL y no dan pid | Se omite cuando no hay |
| **Perfiles muertos** | Se cargaban y se citaban en la cabecera, pero no había forma de usarlos | Barra de perfiles: activar, guardar el actual y borrar |
| **Sin arrastrar y soltar** | Solo se podía instalar por el diálogo | Zona de arrastre con superposición, admite varios archivos |
| **El mock mentía** | `activateProfile` solo marcaba el perfil activo; la interfaz parecía rota donde no lo estaba | El mock aplica selección y orden, como el backend real |

Comprobado en el navegador: 0 elementos interactivos anidados, 11 tarjetas
enfocables por teclado, el campo numérico acepta vaciarse y reescribirse, el
cambio de perfil desactiva los mods y deshabilita "Desplegar", y la superposición
de arrastre aparece.

---

## Buscador de memoria ✅ HECHO

El taller donde salen los cheats. Los patrones AoB no se pueden inventar: son
direcciones de una compilación concreta y hay que encontrarlas en el proceso en
marcha. Esto es lo que convierte "no hay datos" en "hay datos".

### Flujo

1. **Enganchar** el juego (mismas dos barreras que el motor de cheats).
2. **Primera búsqueda** de un valor que se ve en pantalla: dinero, vida, munición.
3. **Cambiarlo en el juego** y **filtrar**: igual a, cambió, no cambió, subió, bajó.
4. Repetir hasta que queden pocas direcciones.
5. **Probar**: escribir en una y ver si el juego reacciona.
6. **Convertir**: traducir la dirección a un `resolve` que aguante reinicios.

### Por qué la primera pasada es rápida

Usa `Buffer.indexOf` sobre los bytes del valor, es decir, búsqueda de patrón
nativa, en vez de comparar posición a posición desde JavaScript. Medido:
**2 candidatos en 112 ms sobre 159 MB**. El precio es que la primera búsqueda
tiene que ser de un valor exacto; los modos de comparación entran a partir de la
segunda, cuando ya quedan pocas direcciones que releer.

### Convertir una dirección en algo reutilizable

Una dirección cruda no vale: cambia en cada ejecución. Hay dos salidas:

- **estática** — la dirección cae dentro de un módulo, así que `módulo + offset`
  es fijo. Verificado: una sonda en `AtreusTarget.exe+0x1008` devuelve
  `{"kind":"static","module":"AtreusTarget.exe","offset":4104}`.
- **puntero** — algún puntero *dentro de un módulo* apunta a ella, lo que da una
  cadena de un nivel que `resolve.ts` ya sabe seguir.

Si no hay ninguna de las dos, **lo dice** en vez de inventar una ruta: haría falta
una cadena de más de un nivel, que este buscador todavía no hace.

### Verificado contra un proceso real

Con un ejecutable de destino propio, no contra un juego: enganche, primera pasada,
filtro por valor exacto, filtro por comparación, escritura confirmada por el
destino, y las dos ramas de conversión.

## Descubrimiento automático de mods ✅ HECHO

Al detectar un juego nuevo en un escaneo, Atreus consulta su catálogo público y
avisa de lo que hay disponible. Verificado contra las APIs reales:

| Juego | Catálogo | Resultado |
|---|---|---|
| Balatro | Thunderstore | 85 mods en 333 ms, con Steamodded y lovely |
| Geometry Dash | Geode | 200 mods en 988 ms, todos `.geode` |
| PEAK | Thunderstore | comunidad existente |
| DOOM: The Dark Ages | — | explica que falta el proveedor |

Descarga e instalación reales probadas de punta a punta: "Node IDs" v1.23.3,
3.080 KB, instalado como `.geode`, desplegado sin extraer y purgado dejando la
carpeta vacía. El nombre sale del manifiesto de dentro del paquete, no del id.

### Lo que esto NO hace

**No descubre cheats, y no puede.** Un patrón AoB es una dirección de una
compilación concreta; no hay catálogo público legible por máquina que los
publique, y las apps comerciales no los generan solas — los escriben personas.
Para eso está el buscador de memoria.

## FASE 6 — Empaquetado y pulido ✅ HECHO

`npm run dist` produce **`release/Atreus-0.1.0-setup.exe`** (88 MB), verificado
ejecutando la app instalada, no solo compilándola.

### Lo que hubo que resolver

**El contenido fuera del asar.** `extraResources` deja `data/` en
`resources/data`, así que las 11 definiciones cargan en la app instalada y se
pueden editar sin reempaquetar. Confirmado en el registro de la app empaquetada:
`definiciones: 11 (11 de fábrica)` y `lista de bloqueo: 12 AppIDs y 24 nombres`
— este segundo era el fallo de alcance que habría dejado Fortnite sin bloquear.

**koffi fuera del asar.** Los `.node` no se cargan desde dentro de un archivo
empaquetado. Con `asarUnpack` funciona: se ejecutó el worker de Steam de la app
**instalada** y leyó 29/38 logros reales de DOOM.

**La firma de código estorbaba.** electron-builder descarga un paquete con
enlaces simbólicos de macOS que Windows no crea sin Modo Desarrollador. Como no
firmamos nada, se desactiva esa fase. Efecto secundario honesto: el `.exe` de la
app se queda con el icono por defecto de Electron; el instalador, el acceso
directo y el menú de inicio sí llevan el nuestro.

**El desinstalador no borra tus datos.** `deleteAppDataOnUninstall: false`: ahí
viven las definiciones, los mods y los perfiles.

### Auto-actualización

`electron-updater` cargado de forma perezosa, sin descarga automática. Ojo con la
distinción: esto trae **versiones nuevas del programa**, que sí exigen empaquetar.
El contenido —juegos, cheats, mods— va por la capa de usuario y `catalog.sync`,
que no necesitan reempaquetar nada.

## Pendientes resueltos de la revisión

| Pendiente | Estado |
|---|---|
| Sin control de versiones | ✅ 4 commits |
| `resources/icon.ico` no existía | ✅ generado desde cero: 7 tamaños, PNG dentro de ICO |
| Sin error boundary | ✅ muestra el fallo y la pila en vez de una ventana en blanco |
| `args.split(' ')` rompía rutas con espacios | ✅ `splitArgs` respeta comillas, con pruebas |
| Cero tests versionados | ✅ **69 pruebas**, y `npm run build` no empaqueta si fallan |
| `openPath` sin restringir | ✅ solo cuatro carpetas conocidas y URLs https |

### Sobre las pruebas

Cubren justo donde ya hubo fallos que costaron una sesión de depuración: el
patrón que se elegía a ciegas, la versión que se perdía al normalizar
separadores, el tipo del esquema que era cadena y no número, las cadenas anchas
del KeyValues binario que desalineaban el resto del archivo. Para que corran sin
Electron se extrajo la lógica pura a `pattern.ts`, `codec.ts`, `args.ts` y
`naming.ts` — que además es mejor diseño, no una contorsión para poder probar.

Una prueba encontró un fallo real mientras se escribía: `1.2.3.zip` daba nombre
`"1"`. Ahora el nombre tiene que contener letras para aceptar el recorte.

---

## Cómo lanzar las dos sesiones de construcción

**Sesión 1 — Lado A:**

> Te encargas del backend (Lado A) del proyecto Atreus en `C:\Users\Syax_\Videos\AtreusCheat`.
> Lee `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` y `docs/CONTRACT.md`.
> Implementa la FASE 6 de la columna "Lado A" (las fases 1-5 ya están hechas).
> Solo escribes en `src/main/**`, `src/preload/**` y `data/**`.
> `src/shared/**` es de solo lectura: si necesitas cambiarlo, párate y avísame.

**Sesión 2 — Lado B:**

> Te encargas de la interfaz (Lado B) del proyecto Atreus en `C:\Users\Syax_\Videos\AtreusCheat`.
> Lee `docs/ROADMAP.md`, `docs/DESIGN.md` y `docs/CONTRACT.md`.
> Implementa la FASE 6 de la columna "Lado B" (las fases 1-5 ya están hechas).
> Solo escribes en `src/renderer/**`.
> `src/shared/**` es de solo lectura: si necesitas cambiarlo, párate y avísame.

En cada punto de sincronía: parar los dos, `npm run dev`, verificar y seguir.

---

## Tabla resumen de esfuerzo y riesgo

| Fase | Lado A | Lado B | Riesgo |
|---|---|---|---|
| 1 Esqueleto | ✅ hecho | ✅ hecho | — |
| 2 Biblioteca | ✅ hecho | ✅ hecho | — |
| 3 Logros (SAM) | ✅ hecho | ✅ hecho | resuelto con la API plana |
| 4 Cheats | ✅ hecho | ✅ hecho | queda: escribir patrones AoB reales por juego |
| 5 Mods | ✅ hecho | ✅ hecho | — |
| 6 Pulido | Baja | Media | Bajo |

Las fases 3 y 4 resultaron menos arriesgadas de lo previsto. Lo que queda del
motor de cheats no es código sino **datos**: escribir los patrones AoB de cada
juego en `data/games/<id>.json`, que hay que sacar del proceso en marcha.

---

## Fases 0 a 6: cerradas

Lo que viene a partir de aquí está en **[NEXT.md](NEXT.md)**: cerrar lo que nunca
se probó contra un juego real, conectar el buscador con las definiciones,
resolver dependencias de mods, y el resto.
