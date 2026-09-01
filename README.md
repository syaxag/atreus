# Atreus

Launcher personal para Windows que unifica, en una sola app, lo que hoy hacen dos
herramientas separadas: el gestor de logros de Steam y el gestor de trainers/mods.

Uso personal, juegos single-player. Ver [docs/SCOPE.md](docs/SCOPE.md).

## Qué hace

| Módulo | Qué resuelve |
|---|---|
| **Biblioteca** | Detecta juegos de Steam, Epic, GOG y Xbox, más ejecutables sueltos. Favoritos y lanzamiento con argumentos |
| **Logros** | Editor de logros y estadísticas de Steam. Reimplementación propia de la lógica de SAM |
| **Cheats** | Motor de trainer: escaneo de patrones, punteros multinivel, congelado de valores, hotkeys globales |
| **Mods** | Instalación desde `.zip`/`.7z`, orden de carga, perfiles, despliegue reversible por hardlink |

Todo se extiende añadiendo un JSON en [`data/games/`](data/games/) — sin recompilar.

## Estado

**Fases 0 a 5 completadas.** Contrato, arquitectura, diseño, esqueleto,
biblioteca real (Steam, Epic, Xbox con carátulas), el editor de logros y
estadísticas de Steam contra la cuenta real, y el motor de cheats (escaneo AoB,
lectura y escritura de memoria, congelado, hotkeys) con su barrera de bloqueo,
y el gestor de mods con despliegue reversible por enlace duro.

Incluye un **buscador de memoria** para sacar los patrones de los cheats del juego
en marcha, porque no se pueden inventar.

Queda la FASE 6: empaquetado NSIS y auto-actualización.
La app compila, arranca y las cinco vistas navegan.
El desarrollo sigue [docs/ROADMAP.md](docs/ROADMAP.md), pensado para dos sesiones
de construcción trabajando en paralelo sin pisarse.

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

## Estructura

```
docs/                 Investigación, arquitectura, roadmap, contrato, diseño, alcance
data/games/           Definiciones por juego (cheats, mods, flags) — extensible
src/shared/           CONTRATO CONGELADO: tipos e interfaz IPC
src/main/             Proceso principal: catálogo, Steam, trainer, mods   ← Lado A
src/preload/          Puente contextBridge                                ← Lado A
src/renderer/         React + Tailwind                                    ← Lado B
```

## Stack

Electron 33 · TypeScript · React 18 · Tailwind 3.4 · Zustand · koffi (FFI a Win32 y
`steamclient.dll`) · electron-vite · electron-builder.

Se eligió Electron y no .NET porque esta máquina tiene Node 24 pero no el SDK de .NET,
y porque un solo lenguaje en back y front deja que los dos lados compartan tipos.

## Créditos

El enfoque técnico del módulo de logros está inspirado en
[Steam Achievement Manager](https://github.com/gibbed/SteamAchievementManager) de
Rick Gibbed (licencia zlib). El código de Atreus está escrito de cero.
