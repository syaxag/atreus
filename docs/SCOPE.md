# Alcance y límites del proyecto

Atreus es una herramienta **de uso personal** para aprender programación de sistemas en
Windows (interop nativo, memoria de procesos, IPC, empaquetado de escritorio) usando
videojuegos como banco de pruebas.

## Lo que sí hace

- **Logros y estadísticas de Steam** — reimplementación propia de la lógica de SAM,
  que es zlib y por tanto libre de reimplementar. Solo sobre juegos que tú posees.
- **Trainer de memoria** en juegos **single-player / offline**: leer y escribir
  valores en tu propia máquina, en tu propia partida.
- **Gestor de mods** genérico: instalar, ordenar, desplegar y revertir mods locales.
- **Launcher**: detección de juegos, favoritos, lanzamiento con argumentos.

## Lo que no hace, por diseño

| No | Por qué |
|---|---|
| Trainer en juegos multijugador competitivos | Perjudica a otros jugadores. Hay una lista de bloqueo en el código |
| Evasión de anti-cheat (EAC, BattlEye, VAC) | Fuera de alcance. Ninguna técnica de ocultación |
| Desempaquetar, descompilar o reutilizar código de WeMod | Es software propietario |
| Consumir el catálogo de trainers de WeMod | Es su propiedad intelectual, y requiere su autenticación |
| Redistribuir binarios de terceros | Reimplementamos, no reempaquetamos |
| Cualquier forma de distribución pública | Es una app personal |

## La lista de bloqueo

`src/main/services/trainer/guard.ts` mantiene la lista. Un juego queda bloqueado si:

1. Su definición trae `"multiplayer": true`.
2. Su AppID está en la lista dura de títulos competitivos.
3. Se detecta un servicio de anti-cheat cargado en el proceso.

Cuando está bloqueado, `trainer.attach` devuelve `state: 'blocked'` y la UI explica el
motivo. **Esta comprobación no es configurable desde ajustes.**

En la biblioteca actual de esta máquina eso afecta a Apex Legends (1172470),
Rocket League (252950) y PEAK (3527290).

## Sobre los logros

Modificar logros de Steam afecta a tu propio perfil público. No rompe nada de otros
jugadores, pero conviene saberlo: es un cambio real y visible en tu cuenta, y algunos
juegos con marcadores online pueden invalidar estadísticas manipuladas.

La app pide confirmación explícita antes de escribir, y `resetAll` lleva un diálogo
destructivo aparte.

## Licencias de origen

| Origen | Licencia | Qué tomamos |
|---|---|---|
| SAM (Rick Gibbed) | zlib | El **enfoque técnico**: interfaces de `steamclient.dll`, flujo de callbacks, proceso por AppID. Código escrito de cero |
| WeMod | Propietaria | Nada de código. Solo la **forma del producto** como referencia de UX |

Si alguna vez se redistribuye este proyecto, se acredita a Rick Gibbed por SAM en el
README, como sugiere la cláusula 1 de la zlib.
