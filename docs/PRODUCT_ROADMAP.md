# Atreus — Roadmap de producto

> **Documento histórico.** Describe el proyecto tal como era antes de la
> reestructuración de septiembre de 2026, cuando Atreus dejó de ser un launcher con
> trainer y pasó a ser una aplicación dedicada a los platinos. El motor de cheats y el
> buscador de memoria que se mencionan aquí ya no existen; el historial de git los
> conserva. El estado actual está en [SCOPE.md](SCOPE.md), [README](../README.md) y
> [ARCHITECTURE.md](ARCHITECTURE.md).

Este documento sustituye al anterior. El anterior describía entregas en
abstracto; este parte de **lo que hay hoy en el disco**, dice qué está roto,
qué está prometido sin cumplir, y qué hace falta para llegar a donde quieres
llevar Atreus: una app de cheats, mods y guías interactivas con mapas, que se
actualiza sola y que algún día se pueda vender o pasar a amigos con clave.

Fecha de la revisión: **2 de septiembre de 2026**, sobre la versión 0.1.1.

---

## 1. Dónde estamos de verdad

| Área | Estado | Comentario honesto |
|---|---|---|
| Detección de biblioteca | ✅ sólido | Steam, Epic, GOG, Xbox, EA App y Battle.net. Es lo mejor de la app |
| Carátulas | ✅ arreglado hoy | Estaba roto para *todas* las plataformas. Ver §2 |
| Logros de Steam | ✅ funciona | Lectura, escritura verificada, copias de seguridad y restauración |
| Iconos de logros | ✅ arreglado hoy | Ahora usa la imagen apagada de Steam para los bloqueados, no un filtro |
| Mods | ✅ funciona | Instalar, ordenar, desplegar, purgar, perfiles; 5 catálogos públicos |
| Guías | ⚠️ a medias | Busca y extrae, pero el resultado es un resumen, no una guía estructurada |
| Mapas interactivos | ⚠️ el motor está, faltan datos | 2 mapas escritos a mano. No hay forma de crear más sin editar JSON |
| Motor de cheats | ⚠️ sin verificar en un juego real | El código está; nunca ha escrito en la memoria de un juego de verdad |
| Cheats existentes | ❌ **cero utilizables** | Ningún juego tiene un patrón resuelto y comprobado |
| Buscador de memoria | ⚠️ un solo salto de puntero | Sirve para valores simples; no para vida escondida tras cadenas largas |
| Actualización de la app | ✅ el código está | Falta publicar el feed HTTPS. Sin eso no hay a quién preguntar |
| Licencias | ✅ funciona | Ed25519, verificación local, la clave privada nunca viaja |
| Rendimiento | ✅ mejorado hoy | Ver §3 |

**La frase corta:** Atreus es hoy un lanzador y gestor de mods muy bueno, un
editor de logros que funciona, y un trainer que todavía no ha demostrado nada.

---

## 2. Lo que estaba roto y ya está corregido

### Carátulas — ninguna salía del disco

Steam cambió la disposición de `appcache/librarycache`: antes eran archivos
planos, luego una carpeta por juego, y desde 2024 **una subcarpeta con hash por
imagen**. El código miraba solo la forma intermedia, así que en tu instalación
—comprobado— no encontraba ni una y todas caían a la CDN. Y los juegos que no
son de Steam directamente no tenían imagen: `headerUrl` se quedaba en `null`
para Epic, GOG, Xbox, EA y Battle.net.

Ahora hay un servicio de carátulas (`catalog/covers.ts` + `catalog/artwork.ts`)
que resuelve en tres pasos, del más barato al más caro:

1. **Disco.** Las tres disposiciones de Steam, y para Xbox el logo declarado en
   `MicrosoftGame.config`.
2. **Caché propia** en `%APPDATA%/Atreus/cache/covers`, que sobrevive a
   reinicios: la biblioteca se pinta sin red.
3. **Red, una vez por juego.** Para Steam, su CDN. Para el resto, se busca el
   título en la tienda de Steam por nombre y se usa esa carátula.

Todo acaba en un archivo local servido por `atreus://cover/...`, así que ni la
CSP ni la falta de conexión pueden dejar la biblioteca en blanco. Los fallos se
recuerdan una semana para no repetir la búsqueda en cada arranque.

De regalo: los tres dominios de reserva que la interfaz intentaba usar estaban
**bloqueados por la propia CSP** de `index.html`, así que ese plan B nunca
funcionó. Ya están permitidos.

### Iconos de logros — el gris de Steam, no un filtro

Steam publica dos imágenes por logro: la de color y la apagada, que suele ser
otro dibujo. Atreus cogía siempre la de color y le aplicaba `grayscale` por CSS.
Ahora se pide la que toca según el estado, con la otra de reserva y el mismo
archivo en el segundo CDN de Valve como último intento.

Y había un segundo fallo debajo, que solo se ve al usar la app: **al activar un
logro, el icono no cambiaba**. `GetAchievementIcon` de Steam devuelve el icono
del **estado actual** del logro — el gris si está bloqueado — y el worker lo
cacheaba como `BAL_07.png`, sin distinguir. Así que lo que la app creía "icono
de color" era en realidad el gris del mismo logro, y activarlo cambiaba una
imagen por ella misma.

Dos cambios: el archivo cacheado lleva el estado en el nombre
(`BAL_07-off.png`), y cada imagen va a la ranura que de verdad le corresponde —
la cacheada al estado que representa, y la otra cara al hash del esquema, que sí
distingue las dos. Comprobado en el esquema real de Balatro: 31 iconos de color
distintos y **un único gris compartido** por todos los bloqueados, que es por lo
que se ven iguales entre sí.

### DOOM: The Dark Ages — la definición era ficción

Tres cosas, todas comprobadas contra tu instalación real:

- Los tres cheats (`god_mode`, `infinite_ammo`, `shield_saw_infinite`) tenían un
  `resolve` **sin `kind` ni `module`**. No cumplían ni el esquema del propio
  proyecto. Al pulsarlos habrían dado «el módulo "undefined" no está cargado», y
  mientras tanto la biblioteca marcaba el juego con "Cheats disponibles". Los
  patrones tampoco salían de ninguna parte verificable. **Eliminados.**
- El proveedor de mods apuntaba a GameBanana **21894**, que es una ficha
  descartada llamada "genshin" con la nota *"Not a valid game"*. El id real es
  **23726** — aunque hoy esa página está vacía.
- La raíz de mods era `base\mods`, que **no existe**. `base/` solo contiene
  `.resources` y `.streamdb`. Lo real (§5) es el Atlan Mod Loader, con `.zip`
  sin extraer en una carpeta `mods` de la raíz del juego. Corregido.

Además, ahora el cargador de definiciones **descarta** cualquier cheat cuya
`resolve` esté mal formada y lo dice en el registro, en vez de aceptarlo y
fallar tres capas más abajo (`catalog/cheat-validate.ts`, con pruebas).

### La barrera de compatibilidad bloqueaba siempre en Steam

Encontrado probando contra DOOM, y es de los peores: una barrera que no protege,
solo estorba.

`verifyCheatBuild` comprobaba la huella del ejecutable contra `game.exePath`.
Pero **en los juegos de Steam ese campo es siempre `null`**: Steam lanza por
`steam://rungameid/...`, así que el escaneo del catálogo nunca lo rellena — no
le hace falta para lanzar. Resultado: *«no se pudo leer el ejecutable»* en
**todos** los juegos de Steam, aunque su huella estuviera publicada.

Ahora la ruta se reconstruye, en `resolveGameExecutable`: el `exePath` si existe,
si no la carpeta de instalación más el `exe` de la definición, y si no el
detector. **Cada fuente tiene que existir en disco para valer** — ese detalle
faltaba en el primer intento del arreglo, y sin él la ruta reconstruida podía
ser inventada y el error acababa siendo el mismo un paso más tarde.

Comprobado contra la instalación real:

```
exePath del catálogo   → null
antes del arreglo      → bloqueado: "No se pudo leer el ejecutable"
ruta reconstruida      → …\common\DOOMTheDarkAges\DOOMTheDarkAges.exe
sha256                 → c76976f0…93   (coincide con el proceso vivo)
después del arreglo    → permitido: "Build verificada: 2026-07-29"
```

### Guardar un cheat lo dejaba inservible

El trainer **falla cerrado**: sin una `cheatBuilds` que coincida con el
ejecutable instalado, no escribe memoria. Así que resolver una dirección desde
el Buscador y guardarla te dejaba con el cheat en la lista y un
*«no hay una versión verificada»* al intentar usarlo. El ciclo quedaba cerrado
en la interfaz y roto un paso después.

Ahora `saveAsCheat` registra la huella de la build sobre la que acabas de
encontrar la dirección. Es además lo honesto: esa dirección vale exactamente
para esa compilación, y cuando el juego se parchee la huella dejará de coincidir
y el cheat **se desactivará solo** en vez de escribir donde ya hay otra cosa.

Las dos correcciones comparten una única función, con 16 pruebas que incluyen
reproducir el comportamiento roto anterior para que no vuelva.

### Una clase CSS que se llamaba como una de Tailwind

Para acelerar las listas largas añadí una utilidad propia y la llamé
`.list-item`. **`list-item` ya existe en Tailwind y significa `display: list-item`.**
Ganaba ella, las filas dejaban de ser `flex`, y en Logros el icono, el texto y el
interruptor se apilaban en vertical en vez de ponerse en línea.

Renombrada a `.defer-render`, y de paso el ancho se deja libre
(`contain-intrinsic-width: none`) en vez de fijarlo. Verificado con una
reproducción lado a lado: misma optimización, diseño correcto. La lección queda
escrita en `theme.css`, junto a la regla: **al inventar una clase hay que
comprobar que el nombre no exista ya.**

### Un `hover` que no existía

`GuidesView` usaba `hover:bg-hover`, una clase que no está en el tema: la lista
de objetivos no se iluminaba al pasar por encima. Arreglado.

---

## 3. El lag: de dónde venía

Tres causas, las tres corregidas.

1. **El monitor de actividad hacía E/S de disco de toda la biblioteca cada 2,5
   segundos.** Para saber si un juego está abierto resolvía su ejecutable, y eso
   llama a `guessExe()`, que lista la carpeta del juego y mide cada `.exe`. Con
   treinta juegos, eran treinta listados de carpeta y un `stat` por ejecutable,
   **veinticuatro veces por minuto**, en reposo. Ahora ese mapa se calcula una
   vez y solo se rehace si cambia la lista de juegos.

2. **Reescaneo completo cada 5 minutos.** Un escaneo lanza PowerShell dos veces
   (paquetes de la Store y programas instalados) y tarda segundos. Ahora es cada
   15 minutos y **se salta si hay un juego abierto**.

3. **Cada vista pedía el catálogo de mods por su cuenta.** La ficha del juego,
   Cheats y Mods llaman a `mods.discover()` al montarse, y como el App remonta
   la vista al cambiar de sección, pasear por las tres pestañas de un juego eran
   nueve consultas a Thunderstore y GameBanana. Ahora hay caché de 10 minutos y
   deduplicación de peticiones en vuelo: la primera paga, las demás son
   instantáneas.

Y en la interfaz: las listas largas (logros, catálogos de mods) usan
`content-visibility`, que se salta el diseño y el pintado de lo que está fuera
de pantalla. En un juego de 547 logros es la diferencia entre arrastrarse y
deslizarse, y a diferencia de virtualizar a mano no rompe la tabulación.

---

## 3 bis. Lo que ya está verificado contra juegos reales

Hasta hoy el motor de cheats nunca había tocado un juego. Ya lo ha hecho — en
solo lectura, sin escribir un byte — y estos son los números reales, medidos en
esta máquina con los juegos abiertos.

### Escaneo de patrones (AoB) — la pieza de la que dependen los cheats

`scripts/verify-aob.ts` saca un trozo de código del **propio ejecutable en
disco**, lo convierte en patrón con comodines, y lo busca en el proceso vivo. Si
aparece una sola vez y en el desplazamiento esperado, la cadena completa
funciona: es exactamente lo que hace `resolveAddress` con una definición real.

| Juego | Módulo | Resultado | Tiempo |
|---|---|---|---|
| Balatro | 404 KB | ✅ único, desplazamiento exacto `0x1c00` | 0 ms |
| DOOM: The Dark Ages | **192 MB** | ✅ único, desplazamiento exacto `0x1980b00` | **91 ms** |

Quedan probados contra un juego de verdad: `findProcessByName`, `openProcess`,
`findModule`, `readMemory`, `compilePattern` y `findInBuffer`. Es decir, **todo
lo que necesita un cheat `aob` para resolverse**, incluido el caso de un módulo
de 192 MB, que era la duda razonable.

### Escaneo de valores — el primer paso del Buscador

| Juego | Memoria legible | Coincidencias de un `int32` | Tiempo |
|---|---|---|---|
| Balatro | 969 MB | 416 873 | 2,2 s |
| DOOM: The Dark Ages | **11,35 GB** | 193 131 | **58 s** |

Dato útil y algo incómodo: **la primera pasada en DOOM tarda casi un minuto** y
deja casi 200 000 candidatos. Es usable, pero pide dos cosas de la fase 1.3: la
búsqueda de valor desconocido (para no tener que teclear un número exacto) y
poder acotar por regiones, porque filtrar 200 000 candidatos a mano es mucho.

### Barreras de seguridad

DOOM: The Dark Ages carga **176 módulos y ninguno es anti-cheat**, así que la
segunda barrera lo deja pasar correctamente. La huella SHA-256 de la build
instalada (20260724, DLC1 hf2) es:

```
c76976f02a5b5f952ac1562a339016a9be97569ea2138c754a198c6395729793
```

### Lo que sigue sin verificar, y por qué

**Escribir en memoria y verlo en pantalla.** Lo intenté: abrí Balatro y DOOM,
pero la captura de pantalla **no puede ver la ventana de ningún juego** — sale el
escritorio en su lugar, en los dos monitores, con el juego en primer plano y a
pantalla completa. Sin ver el dinero o la vida, no hay forma de saber qué número
buscar ni de comprobar que escribirlo cambia algo.

Es el único paso que sigue necesitando a una persona delante, y ahora es mucho
más corto de lo que era: **tú juegas y me dices el número, yo hago el resto.**
Diez minutos, no cuarenta.

---

## 4. Lo que hay que aceptar antes de seguir

Estas cuatro cosas condicionan todo el roadmap. Prefiero decirlas ahora que
después de invertir semanas.

### 4.1 No existe un catálogo público de cheats

Esto es lo más importante del documento. Un cheat de memoria es un patrón de
bytes **de una compilación concreta**: cambia con cada parche del juego. No hay
ninguna API, ningún repositorio, ninguna fuente legible por máquina que los
publique. Los trainers de las apps comerciales los escribe una persona, uno a
uno, y su catálogo es propiedad suya y está detrás de su autenticación.

Consecuencia: **"que detecte el juego y baje sus cheats automáticamente" no es
implementable.** Lo que sí es implementable, y es el plan de la fase 1:

- Un buscador de memoria lo bastante bueno como para que **tú** encuentres el
  valor en 5 minutos.
- Un botón "Guardar como cheat" que convierta ese hallazgo en una definición.
- Un catálogo remoto tuyo, versionado, donde publicas los cheats que ya
  verificaste, con la huella SHA-256 del ejecutable para el que valen.
- Cuando el juego se parchea, la huella deja de coincidir y Atreus **desactiva
  el cheat solo** en vez de escribir en una dirección que ya es otra cosa.

Ese es el modelo que hace que la app tenga valor: no es que los cheats
aparezcan solos, es que **tú los produces una vez y todos los que tengan tu
clave los reciben**. Ahí está el producto vendible.

Para los juegos donde el "cheat" es en realidad un mod (un menú de trucos, un
mod de debug), eso **sí** sale de catálogo público, y ya funciona.

### 4.2 Las guías no se pueden copiar, pero sí estructurar

Traer "la mejor guía ya estructurada paso a paso" desde una web cualquiera
choca con dos cosas: técnicamente, cada web tiene un HTML distinto y muchas
bloquean la automatización; legalmente, reproducir una guía entera dentro de tu
app es republicar el trabajo de otro, y eso es justo lo que no quieres si vas a
venderla.

El camino que sí funciona, y que además es mejor producto:

- **Wikis con API.** `wiki.gg` y Fandom son MediaWiki: tienen API pública, y su
  contenido es CC-BY-SA, es decir, **se puede mostrar dentro de la app citando
  la fuente**. La API devuelve secciones ya estructuradas: eso es un paso a paso
  de verdad, no un resumen.
- **Guías de Steam.** Tienen estructura y están asociadas al AppID.
- **Tu propio catálogo.** Guías escritas por ti, publicadas en el catálogo
  remoto, actualizables sin reinstalar. Para los juegos que te importan, esta es
  la que dará la mejor experiencia con diferencia.

El buscador general se queda como red de seguridad para lo que no esté cubierto.

### 4.3 Los mapas hay que dibujarlos

El motor de mapas ya está y es bueno: zoom, arrastre, filtros, marcadores
ligados al progreso. Lo que no hay es una forma de **crear** un mapa sin editar
JSON a mano. Sin un editor dentro de la app, cada mapa cuesta una tarde de
teclear coordenadas, y nunca habrá más de tres.

### 4.4 Vender esto tiene requisitos que no son código

- **Firma de código.** Sin un certificado, Windows SmartScreen enseña un aviso
  rojo a cada persona que instale. Con amigos se aguanta; vendiendo, no.
  Un certificado OV cuesta del orden de 200–400 € al año.
- **Alojamiento del feed** de actualizaciones (HTTPS con `latest.yml` y el
  instalador). Cualquier hosting estático sirve.
- **Emisión y revocación de claves.** Hoy las claves se firman y no caducan
  salvo que lleves fecha. No hay forma de revocar una filtrada.
- **Realidad legal.** Vender una herramienta que modifica juegos es un terreno
  con aristas. La barrera de multijugador/anti-cheat que ya tiene la app no es
  decorativa: es lo que separa "herramienta para tu partida offline" de algo que
  no querrás tener a tu nombre.

---

## 5. DOOM: The Dark Ages — cómo funcionan sus mods

Comprobado sobre la instalación real (build `20260724-000017`, DLC1 hf2).

**Estructura.** El juego es idTech 8. Todo su contenido vive en
`base/*.resources` (archivos de recursos) y `base/*.streamdb` (datos en
streaming, decenas de GB), más `base/game/<mapa>/…` por nivel y
`base/packagemapspec.json`, que es el índice que dice qué archivo carga cada
mapa. **No hay WAD**: eso era el DOOM clásico; desde DOOM 2016 el formato es
`.resources`. Y no existe ninguna carpeta `mods`: el juego, tal cual, no carga
nada suelto.

**Cómo modea la comunidad.** Con un cargador externo, el **Atlan Mod Loader**:
se copia `AtlanModLoader.exe` junto a `DOOMTheDarkAges.exe`, los mods se dejan
**en `.zip` sin extraer** dentro de una carpeta `mods` en la raíz del juego, y
el cargador los inyecta en los `.resources` al arrancar. Si el juego revienta al
iniciar con mods puestos, se borra `modloader_cache.bin` y se vuelve a lanzar.

**Qué significa para Atreus.** La definición ya está corregida: raíz `mods`,
`.zip` marcado como paquete (se copia entero, no se extrae), cargador `atlan`.
Con eso, instalar un mod de Dark Ages desde Atreus deja el archivo exactamente
donde el cargador lo espera.

**Dónde están los mods.** El catálogo grande es **Nexus Mods**
(`nexusmods.com/doomthedarkages`). GameBanana tiene ficha (23726) pero está
vacía. Nexus exige clave de API para listar y descargar → es la tarea 6 de la
fase 1.

**Cheats.** Ninguno verificado. El juego admite consola con
`+com_enableConsole 1`, que es una vía mucho más estable que un patrón de
memoria y que merece explorarse antes que el trainer.

Fuentes: [Instalar mods (wiki de EternalMods)](https://wiki.eternalmods.com/books/dark-ages-modding/page/installing-mods-doom-the-dark-ages) ·
[DOOMModLoader](https://github.com/ZwipZwapZapony/DOOMModLoader/wiki/Installing-Mods) ·
[Nexus Mods](https://www.nexusmods.com/doomthedarkages)

---

## FASE 1 — Que funcione al 100 %

El objetivo es que no quede nada que la app prometa y no cumpla.

### 1.1 Verificar el motor de cheats contra un juego real 🟡 *medio hecho*

La mitad técnica ya está: enganchar, enumerar módulos, leer memoria y resolver
un patrón AoB funcionan contra Balatro y contra DOOM, con números medidos
(ver §3 bis). Lo que falta es la mitad que necesita ojos:

1. Abrir el juego y decirme un número que se vea en pantalla (el dinero de
   Balatro, el oro de DOOM).
2. Yo lo busco, filtro y aíslo la dirección.
3. Escribimos en ella y **lo ves cambiar en pantalla**.
4. Se guarda desde el Buscador, con la huella de la build, y se comprueba que
   sobrevive a cerrar y reabrir el juego.

Diez minutos, no cuarenta: el resto de la cadena ya está probada.

### 1.2 Del buscador a la definición, sin copiar y pegar

Hoy el buscador te da un JSON y tú editas el archivo a mano. Falta:
`scanner.saveAsCheat()`, que escriba en la capa de usuario sin tocar la de
fábrica; un formulario mínimo (nombre, grupo, tipo, hotkey, si congela); y que
al guardar salte a Cheats con el cheat ya listado.

Sin esto, el buscador es una herramienta suelta y la fase 1.1 no se aprovecha.

### 1.3 Buscador de memoria más capaz

Las tres limitaciones conocidas: solo un salto de puntero (hacen falta dos o
tres para juegos modernos), no hay búsqueda de "valor desconocido" (la que hace
falta para barras de vida sin número), y no hay búsqueda por rango ni
tolerancia en decimales.

### 1.4 Dependencias de mods

65 de los 96 mods de Balatro declaran dependencias. Hoy Atreus enseña el número
y no hace nada, así que instalar uno suelto deja algo que el juego no carga.
Hay que resolver el árbol, instalar lo que falte en orden, y avisar al
desinstalar de qué se queda colgado.

### 1.5 Publicar el feed de actualizaciones

El código del actualizador está y el `latest.yml` se genera. Falta subir
instalador + manifiesto a una URL HTTPS y ponerla en Ajustes. **Es media hora
de trabajo y cierra la promesa de "se actualiza sola".** Debería ser lo primero.

### 1.6 Nexus Mods

El catálogo más grande, y el único sitio con mods de DOOM: The Dark Ages.
Necesita clave de API personal y tiene límites de descarga en cuentas gratuitas.

### 1.7 Limpieza

Poca cosa, la verdad: el código está más limpio de lo que suele estar un
proyecto de este tamaño.

- `@tanstack/react-virtual` estaba en las dependencias sin usarse. **Quitado**;
  las listas largas se resuelven con `content-visibility`, que no cuesta nada.
- `data/games/epic.Fortnite.json`, `steam.1172470` (Apex), `steam.252950`
  (Rocket League) y `steam.3527290` (PEAK) solo declaran `multiplayer: true`, y
  `data/blocklist.json` ya cubre esos cuatro por AppID o por nombre. Parecen
  redundantes — **pero no los borres**: son una segunda capa de la barrera, y
  duplicar una comprobación de seguridad es de las pocas duplicaciones que
  merecen la pena.

---

## FASE 2 — Que sea el producto que quieres

### 2.1 Guías estructuradas de verdad

Un proveedor de MediaWiki (`wiki.gg` + Fandom) que traiga secciones ya
estructuradas con su atribución, en vez de un resumen de HTML arbitrario. Es el
salto de "resultados de búsqueda dentro de la app" a "la guía dentro de la app".

### 2.2 Editor de mapas interactivos

Cargar una imagen de mapa, hacer clic para poner nodos, escribir su etiqueta y
categoría, unir nodos, y exportar el JSON al catálogo. Convierte los mapas de
"algo que hay que programar" en "algo que se hace en diez minutos", que es la
única forma de que lleguen a ser muchos.

### 2.3 Progreso ligado a los logros

Ya se leen los logros de Steam y ya hay una checklist de completado. Falta
cruzarlos: que marcar un logro tache su paso en la guía y viceversa.

### 2.4 Publicación de contenido desde la propia app

Un modo "autor" donde tú editas una definición, un mapa o una guía, y Atreus
genera el JSON firmado listo para subir al catálogo. Es lo que convierte tu
trabajo en algo que le llega a todo el que tenga clave, sin reinstalar nada.

### 2.5 Pulido de interfaz

`Ctrl+K` para saltar a un juego. Repaso de accesibilidad (foco, tabulación,
lectores de pantalla). Estado vacío cuando no hay ninguna plataforma instalada.

---

## FASE 3 — Distribución cerrada

1. **Firma de código.** Certificado OV y firma en el `dist`. Sin esto, cada
   instalación empieza con un aviso rojo de Windows.
2. **Revocación de licencias.** Hoy una clave filtrada vale para siempre.
   Opciones: fecha de caducidad corta con renovación, o atar la clave a un
   identificador de máquina (el campo `hw` ya está reservado en el formato).
3. **Canal de pruebas** aparte del estable, para no romperle la app a nadie.
4. **Servidor de catálogo propio** con historial y reversión.
5. **Telemetría mínima y opcional** — solo para saber qué juegos usa la gente y
   dónde merece la pena escribir cheats. Con permiso explícito o nada.

---

## Orden que recomiendo

```
1.5 publicar el feed        ← media hora, cierra la promesa más visible
 │
1.1 verificar el trainer    ← te necesita; hasta esto, los cheats no existen
 │
1.2 guardar como cheat      ← cierra el ciclo: encontrar → guardar → usar
 │
2.1 guías de wiki           ← el salto de calidad más grande por esfuerzo
 │
2.2 editor de mapas         ← convierte los mapas en algo escalable
 │
1.3 buscador mejor · 1.4 dependencias · 1.6 Nexus
 │
FASE 3
```

La 1.5 primero porque es lo más barato y lo más visible. La 1.1 justo después
porque **todo el discurso de cheats se apoya en algo que nunca se ha probado**,
y si el trainer falla contra un juego real, las fases 1.2 y 1.3 cambian de forma.

---

## Anotaciones sueltas

- **Lo mejor que tiene Atreus hoy no son los cheats, son los mods y los logros.**
  Si mañana se lo enseñas a un amigo, eso es lo que le va a gustar. Merece la
  pena no hundir esa parte por correr detrás de la otra.
- **La barrera de multijugador es un activo, no un estorbo.** Es lo que hace
  defendible el proyecto. No la debilites por un caso concreto.
- **La capa de usuario en `%APPDATA%` es la mejor decisión de arquitectura del
  proyecto.** Todo lo que se pueda mover a datos en vez de a código, muévelo:
  es lo que permite arreglar un juego sin sacar una versión.
- **Cuidado con el remontaje de vistas.** `App.tsx` remonta la vista entera al
  cambiar de sección. Hoy se compensa con cachés en el proceso principal; si
  algún día una vista guarda estado caro, habrá que replantearlo.
- **La licencia busca su clave pública en `process.resourcesPath`**, que en
  desarrollo apunta dentro de `node_modules/electron`. En la app instalada
  funciona; en `npm run dev` nunca encontrará la clave. Vale la pena arreglarlo
  antes de que confunda a alguien.
