# Alcance y límites del proyecto

Atreus es una herramienta **de uso personal** para cazar platinos: llevar la cuenta de
lo que falta para el 100 % de logros de cada juego, leer las guías que explican cómo
conseguirlo y abrir los mapas donde está cada cosa, sin salir de la aplicación.

## Lo que sí hace

- **Informe de platino** — cuántos logros llevas, cuánto tiempo has jugado, cuánto
  llevas persiguiendo el platino, cuánto te queda y cómo de duro es. Se calcula
  cruzando los logros del cliente de Steam, la rareza global publicada por Steam y
  las horas de tu cuenta local.
- **Logros de cualquier plataforma** — en Steam, del cliente, con reimplementación
  propia de la lógica de SAM (zlib, libre de reimplementar) y sobre juegos que posees.
  En Xbox, con la clave de OpenXBL que genera el usuario, el estado es igual de real.
  En Epic, EA o GOG la lista sale del catálogo público de Steam y el progreso lo marca
  el usuario, porque ninguna de esas plataformas lo publica sin iniciar sesión.
- **Guías con texto completo** — de la comunidad de Steam y de las wikis del juego,
  mostradas dentro de Atreus con atribución y enlace a la fuente.
- **Mapas interactivos** — se abre el mapa real del proveedor (MapGenie, wikis) en una
  pestaña integrada. Atreus no redibuja el mapa ni copia sus marcadores.
- **Gestor de mods** genérico: instalar, ordenar, desplegar y revertir mods locales.
- **Launcher**: detección de juegos, favoritos, lanzamiento con argumentos.

## Lo que no hace, por diseño

| No | Por qué |
|---|---|
| Leer o escribir la memoria de un juego | Se retiró en septiembre de 2026. No aporta nada a un platino y era la única parte que tocaba procesos ajenos |
| Trainers, cheats o buscador de valores | Lo mismo. El historial de git conserva el motor si alguna vez hiciera falta |
| Evasión de anti-cheat (EAC, BattlEye, VAC) | Fuera de alcance. Ninguna técnica de ocultación |
| Alojar o republicar guías | Se muestra el texto con su fuente y un enlace para abrirla fuera; nunca se copia sin atribuir |
| Pedir la contraseña de Xbox, Epic o EA | Nunca. Para Xbox hay una clave de OpenXBL que generas tú en su web; Atreus solo maneja la clave y puedes revocarla cuando quieras |
| Desempaquetar, descompilar o reutilizar código de terceros | Reimplementamos, no reempaquetamos |
| Cualquier forma de distribución pública | Es una app personal |

## Sobre desbloquear logros a mano

Atreus puede marcar logros como conseguidos, porque el cliente de Steam lo permite: es
la misma llamada que hace cualquier juego. No es baneable y no altera archivos.

Aun así, la aplicación **avisa antes de la primera vez** con un diálogo que explica los
tres puntos que importan —que no es baneable, que sí puede arruinar la experiencia del
juego, y que no hay vuelta atrás limpia— y no deja tocar nada hasta que se acepta. El
aviso se guarda en `settings.achievementRiskAccepted` y se puede reactivar en Ajustes.

Antes de cada escritura se guarda una copia del estado en el Historial. `resetAll`
lleva un diálogo destructivo aparte.

Modificar logros afecta a tu propio perfil público: es un cambio real y visible en tu
cuenta, y algunos juegos con marcadores online pueden invalidar estadísticas alteradas.

## Datos de terceros

Todo lo que Atreus consulta es público y sin autenticar:

| Fuente | Qué se saca | Clave |
|---|---|---|
| `localconfig.vdf` de Steam | Minutos jugados de cada AppID | No, es un archivo local |
| `ISteamUserStats/GetGlobalAchievementPercentagesForApp` | Rareza global de cada logro | No, es pública |
| `steamcommunity.com/stats/<id>/achievements/` | Lista de logros con nombre, descripción, icono y rareza | No, y no hace falta poseer el juego |
| `store.steampowered.com/api/storesearch/` | AppID de un juego a partir de su nombre | No |
| `steamcommunity.com/app/<id>/guides/` | Listado y texto de las guías | No |
| `api.php` de wiki.gg y Fandom | Búsqueda y texto de páginas de wiki | No |
| Portada de `mapgenie.io` | Directorio de juegos con mapa | No |

| `ISteamUserStats/GetPlayerAchievements` | Tu progreso real de un juego, sin abrir el cliente | Sí, la clave de Steam que pongas en Ajustes |
| `xbl.io` (OpenXBL) | Tus logros de Xbox, con fechas y rareza | Sí, la clave de OpenXBL que generes tú |

La clave es **opcional**: sin ella todo lo demás funciona igual. Lo que aporta es
velocidad —la biblioteca entera se lee sin abrir un proceso de Steam por juego— y que el
progreso salga aunque Steam esté cerrado. Es tuya, se guarda solo en tu equipo y nunca
sale hacia ningún sitio que no sea la API de Valve.

## Licencias de origen

| Origen | Licencia | Qué tomamos |
|---|---|---|
| SAM (Rick Gibbed) | zlib | El **enfoque técnico**: interfaces de `steamclient.dll`, flujo de callbacks, proceso por AppID. Código escrito de cero |

Si alguna vez se redistribuye este proyecto, se acredita a Rick Gibbed por SAM en el
README, como sugiere la cláusula 1 de la zlib.
