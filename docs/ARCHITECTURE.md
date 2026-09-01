# Atreus — Arquitectura

## Decisión de stack

| Capa | Elección | Motivo |
|---|---|---|
| Shell | **Electron 33** | Node 24 ya instalado; sin .NET SDK en la máquina. Es la misma forma que usa WeMod |
| Lenguaje | **TypeScript** estricto | Un solo lenguaje en back y front → los dos lados comparten tipos |
| Build | **electron-vite** | HMR en el renderer, bundling de main/preload, un solo comando |
| UI | **React 18 + Tailwind 3.4** | Control total del diseño minimalista; sin librería de componentes pesada |
| Estado | **Zustand** | Mínimo, sin boilerplate |
| FFI nativo | **koffi** | Llama Win32 y `steamclient.dll` sin compilar addons C++ |
| Empaquetado | **electron-builder** (NSIS) | Auto-update integrado |
| Persistencia | JSON en `%APPDATA%/Atreus` | Sin base de datos; simple e inspeccionable |

**Sin .NET.** Se descartó reutilizar `SAM.API.dll` directamente porque exigiría
instalar el SDK de .NET y mantener dos runtimes. Reimplementamos su interop con koffi.

---

## Diagrama de procesos

```
┌────────────────────────────────────────────────────────────┐
│  Proceso MAIN de Electron  (Node)          ← Lado A      │
│                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ catalog  │ │  steam   │ │ trainer  │ │     mods     │   │
│  │ scanner  │ │  service │ │  engine  │ │   manager    │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │
│       │            │            │              │           │
│       └────────────┴──── IPC router ───────────┘           │
└──────────────────────────┬─────────────────────────────────┘
                           │ contextBridge (preload, typed)
┌──────────────────────────┴─────────────────────────────────┐
│  Proceso RENDERER (Chromium)                ← Lado B     │
│  React + Tailwind — Biblioteca · Logros · Mods · Ajustes   │
└────────────────────────────────────────────────────────────┘
                           │ fork()
┌──────────────────────────┴─────────────────────────────────┐
│  steam-worker.js  (1 proceso POR AppID)     ← Lado A     │
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

### `services/trainer` — motor de cheats
- `process.ts` — `OpenProcess`, `EnumProcessModules`, listado de procesos.
- `memory.ts` — `ReadProcessMemory` / `WriteProcessMemory`, tipos i8..f64.
- `scanner.ts` — escaneo de patrones AoB con máscara `??`, sobre regiones
  obtenidas de `VirtualQueryEx`.
- `pointer.ts` — resolución de punteros multinivel (`base + off1 -> off2 -> …`).
- `freezer.ts` — bucle a 60 ms que reescribe los valores congelados.
- `hotkeys.ts` — `globalShortcut` de Electron por cheat.
- `guard.ts` — **lista de bloqueo** de títulos multijugador/anti-cheat.

Las definiciones de cheats viven en `data/games/<id>.json` → actualizables sin recompilar.

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
  "cheats": [
    {
      "id": "inf-money",
      "name": "Dinero infinito",
      "type": "toggle",
      "hotkey": "F1",
      "resolve": { "kind": "aob", "module": "Balatro.exe",
                   "pattern": "48 8B ?? ?? ?? 00 00 89", "offset": 12 },
      "write": { "type": "i32", "value": 999999, "freeze": true }
    }
  ],
  "mods": { "root": "Mods", "loader": "lovely" }
}
```

---

## Contenido en dos capas — añadir sin reempaquetar

> Resumen práctico de qué se actualiza por dónde: [UPDATING.md](UPDATING.md).

Los juegos, cheats y listas viven **fuera** del código, en dos capas:

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
se nota al momento: se recarga, se revalida y la biblioteca actualiza qué juegos
tienen cheats. Sin reiniciar.

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

### Lo que no se puede sobrescribir

La lista de bloqueo y los módulos anti-cheat **se suman** entre capas: se pueden
añadir títulos, nunca quitar los de fábrica. Es una barrera de alcance, no una
preferencia. Ver [SCOPE.md](SCOPE.md).

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

### Esto cubre mods, no cheats

Un cheat es un patrón de memoria de una **compilación concreta**. No existe
ningún catálogo público legible por máquina que los publique, y las apps
comerciales no los generan solas: los escriben personas, uno a uno. Para eso
está el buscador de memoria, y el catálogo de definiciones para compartirlos
una vez encontrados.

### Mods

Los mods ya vivían fuera del paquete: se instalan en
`%APPDATA%/Atreus/mods/<gameId>/` y se despliegan por enlace duro. Instalar uno
nuevo nunca ha requerido reempaquetar nada.

---

## Persistencia (`%APPDATA%/Atreus/`)

```
settings.json          preferencias, API key de Steam, rutas
library.json           caché del escaneo de juegos
data/games/*.json      definiciones del usuario — mandan sobre las de fábrica
data/blocklist.json    añadidos a la lista de bloqueo (solo suma)
data/catalog.json      marca de la última sincronización
profiles/<id>.json     perfiles de mods y estado de cheats por juego
mods/<id>/             staging de mods
cache/icons/<appid>/   iconos de logros convertidos a PNG
logs/
```
