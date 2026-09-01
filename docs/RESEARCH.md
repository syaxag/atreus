# Revisión de las dos aplicaciones de origen

Fecha: 2026-09-01

## 1. `C:\Users\Syax_\Videos\xd` — Steam Achievement Manager (SAM)

| Dato | Valor |
|---|---|
| Autor | Rick Gibbed |
| Licencia | **zlib** (permisiva, permite uso, modificación y redistribución) |
| Última versión del repo | commit `de8b710`, 2026-03-19 ("Fix missing integer stats") |
| Runtime | .NET Framework 4.x (`v4.0.30319`), WinForms |

### Binarios

| Archivo | Tamaño | Rol |
|---|---|---|
| `SAM.Picker.exe` | 52 KB | Buscador/selector de juegos. Descarga la lista de AppIDs, muestra grid con iconos, lanza `SAM.Game.exe <appid>` |
| `SAM.Game.exe` | 49 KB | Editor real: logros + estadísticas de **un** AppID. Un proceso por juego |
| `SAM.API.dll` | 31 KB | Interop con Steam. Referencias internas confirmadas: `SteamClient0xx`, `SteamUserStats0xx` |

### Cómo funciona por dentro

SAM **no** usa `steam_api.dll` (la API pública del SDK). Carga directamente
`steamclient.dll` desde la instalación de Steam y obtiene las interfaces COM-like
por versión (`SteamClient017`, `SteamUserStats012`, …) vía `CreateInterface`.

Flujo:
1. Establece `SteamAppId` en el entorno del proceso.
2. `CreateInterface("SteamClient0xx")` → `CreateSteamPipe` → `ConnectToGlobalUser`.
3. `GetISteamUserStats` → `RequestCurrentStats` → callback `UserStatsReceived`.
4. Lectura/escritura: `GetAchievement`, `SetAchievement`, `ClearAchievement`,
   `GetStatFloat/Int`, `SetStatFloat/Int`.
5. `StoreStats` → Steam sincroniza con el servidor.

**Restricción de diseño heredada:** Steam vincula **un AppID por proceso**. Por eso
SAM lanza un `.exe` distinto por juego. Nuestro launcher debe replicar esto con un
proceso satélite por juego (no se puede hacer todo dentro del proceso principal).

### Funcionalidades a conservar
- Listado de juegos con logros (el "Picker").
- Marcar/desmarcar logros individuales, "marcar todos", "invertir".
- Editor de estadísticas (int y float), incluido el flag de "solo lectura"/protegidas.
- Columna de fecha de desbloqueo (`unlock time`, añadido en commit `506364e`).
- Búsqueda por texto sobre la lista de logros.
- Iconos y descripciones de logros (incluye los ocultos).

---

## 2. `C:\Users\Syax_\AppData\Local\Wand` — WeMod

| Dato | Valor |
|---|---|
| Producto | WeMod (marca interna "Wand") |
| Versión instalada | `app-12.50.0` (previa `app-12.48.1`) |
| Licencia | **Propietaria**, © 2015-2025 Wand. Solo los componentes de terceros son OSS (Electron MIT, OBS GPL) |
| Runtime | **Electron** (Chromium + Node) |
| Actualizador | **Squirrel.Windows** (`Update.exe`, `packages/`, logs `Squirrel-*.log`) |

### Arquitectura observada (solo estructura de carpetas, sin desempaquetar)

```
app-12.50.0/
  Wand.exe                        223 MB  ← binario Electron principal
  WeMod.exe                        55 KB  ← stub lanzador
  resources/app.asar               52 MB  ← código JS empaquetado (propietario)
  resources/app.asar.unpacked/static/unpacked/
      trainerlib/      ← motor nativo de trainers (parcheo de memoria)
      overlay/         ← overlay in-game
      video-overlay/   ← captura/overlay de vídeo (de ahí el OBS GPL)
      capture/         ← captura de pantalla/vídeo
      native-modules/  ← addons nativos de Node
      auxiliary/       ← procesos auxiliares
      preload/         ← puentes preload de Electron
```

### Funcionalidades a replicar (reimplementadas desde cero)
- Detección de juegos instalados (Steam, Epic, GOG, Xbox, ejecutables sueltos).
- Catálogo de "mods"/trainers por juego, actualizable.
- Motor de trainer: attach a proceso, escaneo de patrones (AoT), lectura/escritura
  de memoria, congelado de valores, punteros multinivel.
- Toggles de cheats con hotkeys globales.
- Overlay opcional en juego.
- Auto-actualización de la app y del catálogo.
- Perfiles/favoritos y estado por juego.

---

## 3. Límites del proyecto (importante)

SAM es zlib → **podemos reimplementar libremente su lógica**. Lo haremos con nuestro
propio código; no hace falta redistribuir sus binarios.

WeMod es **propietario**. Por tanto:
- **No** se desempaqueta ni se descompila `app.asar`.
- **No** se reutiliza su `trainerlib`, su overlay ni sus módulos nativos.
- **No** se consume su catálogo de trainers ni se toca su autenticación.
- Se replica la **forma** de la funcionalidad con implementación propia
  (FFI a Win32 para memoria, formato JSON propio para definiciones de cheats).

### Alcance de uso
Este launcher es para **uso personal en juegos single-player / offline**.

Se incluye una **lista de bloqueo** para el módulo de trainer sobre títulos
multijugador competitivos o con anti-cheat. En la biblioteca detectada eso afecta a:

| AppID | Juego | Trainer |
|---|---|---|
| 1172470 | Apex Legends | **BLOQUEADO** (EAC, multijugador) |
| 252950 | Rocket League | **BLOQUEADO** (multijugador) |
| 3527290 | PEAK | Bloqueado por defecto (multijugador co-op) |

El resto del catálogo detectado es apto: Balatro, Halo: Campaign Evolved,
DOOM: The Dark Ages, Geometry Dash, Resident Evil 4, KovaaK's.

---

## 4. Entorno de la máquina (verificado)

| Herramienta | Estado |
|---|---|
| Node.js | **v24.15.0** ✅ |
| npm | 11.12.1 ✅ |
| Git | 2.54.0 ✅ |
| Python | 3.11.15 ✅ |
| .NET SDK | ❌ **no instalado** (solo el runtime host) |
| Steam | `C:\Program Files (x86)\Steam` — múltiples bibliotecas ✅ |

→ Esto decide el stack: **Electron + TypeScript**, no .NET.
Ver [ARCHITECTURE.md](ARCHITECTURE.md).
