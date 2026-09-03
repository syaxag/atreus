# Atreus — Sistema de diseño

Minimalista, oscuro, gris y blanco, con morado como único acento.
Todos los tokens viven en `src/renderer/styles/theme.css`. **Nunca escribir un color
literal en un componente** — siempre `var(--…)`.

## Paleta

### Fondos
| Token | Valor | Uso |
|---|---|---|
| `--bg-base` | `#0A0A0D` | Fondo de la ventana |
| `--bg-surface` | `#121216` | Sidebar, paneles, tarjetas |
| `--bg-elevated` | `#1A1A20` | Modales, dropdowns, hover de fila |
| `--bg-inset` | `#08080A` | Campos de entrada, huecos |

### Bordes
| Token | Valor | Uso |
|---|---|---|
| `--border` | `#26262F` | Separadores por defecto |
| `--border-strong` | `#34343F` | Hover, foco no-acento |

### Texto
| Token | Valor | Uso |
|---|---|---|
| `--text` | `#F5F5F7` | Texto principal |
| `--text-muted` | `#9E9EAC` | Secundario, descripciones |
| `--text-faint` | `#6B6B78` | Metadatos, deshabilitado |

### Acento (morado) — el único color de la interfaz
| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#8B5CF6` | Estado activo, toggles on, foco |
| `--accent-hover` | `#A78BFA` | Hover |
| `--accent-press` | `#7C3AED` | Pulsado |
| `--accent-soft` | `rgba(139,92,246,.12)` | Fondo de badges/selección |
| `--accent-glow` | `rgba(139,92,246,.35)` | Sombra de foco |

### Semánticos — usar con moderación, solo para estado
`--success #34D399` · `--warn #FBBF24` · `--danger #F87171`

## Reglas de composición

1. **Un solo acento.** Si en una pantalla hay más de un elemento morado compitiendo,
   sobra uno. El morado señala *lo activo*, no *lo importante*.
2. **Jerarquía por peso y espaciado, no por color.** El gris hace el trabajo.
3. **Bordes de 1px, nunca sombras difusas** salvo en elementos flotantes reales.
4. **Radio**: `--r-sm 6px` (controles) · `--r-md 10px` (tarjetas) · `--r-lg 14px` (modales).
5. **Espaciado en múltiplos de 4.** Escala: 4 · 8 · 12 · 16 · 24 · 32 · 48.
6. **Densidad alta.** Es una herramienta, no una landing. Filas de 40-44px.

## Tipografía

- Interfaz: `Inter`, fallback `Segoe UI Variable`, `Segoe UI`, `system-ui`.
- Monoespaciada (direcciones de memoria, patrones AoB): `JetBrains Mono`, `Consolas`.

| Estilo | Tamaño / peso | Uso |
|---|---|---|
| `--t-display` | 24px / 600 | Título de vista |
| `--t-title` | 16px / 600 | Cabecera de sección |
| `--t-body` | 14px / 400 | Texto general |
| `--t-label` | 13px / 500 | Etiquetas, botones |
| `--t-caption` | 12px / 400 | Metadatos |
| `--t-mono` | 12px / 400 | Hex y patrones |

## Movimiento

- Duración: 120ms controles, 180ms paneles, 240ms modales.
- Curva: `cubic-bezier(.2,.8,.2,1)`.
- **Nunca animar propiedades de layout.** Solo `opacity` y `transform`.
- Respetar `prefers-reduced-motion`.

El movimiento aquí no decora: dice que algo ha cambiado, de dónde viene o que
la aplicación sigue viva. Si una animación no responde a ninguna de esas tres
cosas, sobra.

| Clase | Qué anuncia |
|---|---|
| `animate-view` | Se ha cambiado de vista |
| `animate-rise` | Entra una tarjeta o una fila, escalonada por su posición |
| `animate-modal` | Un diálogo se pone delante de todo lo demás |
| `animate-marca` | La barra morada de la sección activa, creciendo desde su centro |
| `animate-flota` | Un estado vacío: no hay nada, pero no está colgado |
| `animate-toast-in` / `-out` | Un aviso que llega y se va |
| `skeleton` | Contenido en camino (un reflejo que cruza, no un parpadeo) |
| `animate-sweep` | Un proceso sin porcentaje conocido |

Dos que no son clases y merecen la misma disciplina:

- **La barra de progreso se llena al aparecer**, con `transform: scaleX()`. Es
  el componente que más se repite en la aplicación; verla crecer una vez hace
  que una parrilla se lea como un progreso y no como un gráfico. Va por
  `transform` y no por `width` para no rehacer el diseño en cada fotograma de
  cada tarjeta visible.
- **El marcador de platinos sube contando** (`useContador`). Solo él: es el
  número que da nombre a la aplicación. Contar cada cifra de cada tarjeta sería
  ruido, y contar algo que no ha cambiado por decisión del usuario es mentira.

Las animaciones infinitas se cortan a una repetición bajo `prefers-reduced-motion`
en vez de acelerarse: acortar una a 0,01 ms la repetiría cien mil veces por
segundo, que es justo lo contrario de lo que pide quien la desactiva.

## Layout de la ventana

```
┌──────────────────────────────────────────────────────────┐
│ ▓ Atreus                                       ─  □  ✕   │  40px, arrastrable
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Sidebar  │  Contenido                                    │
│ 220px    │                                               │
│          │                                               │
│ 7 platin.│                                               │
│ ──────── │                                               │
│ Colección│                                               │
│ Trofeos  │                                               │
│ Rutas    │                                               │
│ Atlas    │                                               │
│ Taller   │                                               │
│          │                                               │
│ ──────── │                                               │
│ Ajustes  │                                               │
└──────────┴───────────────────────────────────────────────┘
```

- Los nombres de las secciones no son los de un launcher: **Colección, Trofeos,
  Rutas, Atlas, Taller**. La aplicación no administra programas instalados, así
  que no habla como si lo hiciera. Arriba del todo va el marcador —cuántos
  platinos tienes y cuántos persigues—, que es el dato de la casa.
- Ventana **frameless**: la barra de título es nuestra (`-webkit-app-region: drag`).
  Los botones llevan `no-drag`.
- Sidebar: sin iconos de colores. Item activo = texto blanco + barra morada de 2px
  a la izquierda + fondo `--accent-soft`.
- **La barra lateral va en dos grupos, y el juego los separa.** Colección y
  Actividad valen siempre. Trofeos, Rutas, Atlas y Taller operan sobre el juego
  en contexto y no significan nada sin él, así que van **debajo del juego y
  sangrados**, bajo el rótulo *Sobre este juego*. Estaban todos en la misma
  lista y el juego que los gobierna aparecía al final de la barra, lejos: pulsar
  "Trofeos" sin haber elegido nada no hacía nada y tampoco lo explicaba.
- **Un nombre con carácter lleva su traducción debajo.** "Rutas" o "Taller" son
  la voz de la aplicación y se quedan, pero cada uno de esos cuatro lleva una
  línea en `--text-faint` diciendo qué hay dentro —*guías con su texto completo*,
  *instalar y ordenar mods*—. Un nombre bonito que hay que adivinar estorba.
- **Los atajos se ven.** El buscador de la Colección enseña su `Ctrl K` en una
  tecla dibujada al final del campo, y la esconde en cuanto hay texto. Un atajo
  que no se anuncia no existe.

## La marca

Una loseta morada con la **A** calada en negativo, apoyada en una peana ancha:
se lee como una copa a primer golpe y como una A al mirarla, que es exactamente
lo que persigue quien usa esto. Antes el travesaño iba inclinado como un rayo,
guiño al icono de cheats; los cheats se fueron de la aplicación y el guiño se
quedó señalando a nada.

Todo son barras rectas y gruesas porque el examen de un icono es a **16 píxeles**:
ahí un trazo fino se deshace y una peana se ve.

Vive en dos sitios y tienen que dibujar **la misma geometría**: `scripts/make-icon.mjs`
(que rasteriza el `.ico` y el `.png` con distancias con signo) y el `<Mark>` de
`TitleBar.tsx` (SVG en línea, para que herede los tokens del tema). Estuvieron
desacompasados —una A maciza aquí, una de trazo allí— y la aplicación se
presentaba con dos marcas distintas según dónde la miraras. **Al tocar una hay
que tocar la otra.**

## Componentes: notas concretas

- **Toggle**: pista 36×20, `--border-strong` apagado → `--accent` encendido.
- **Tarjeta de juego**: carátula 16:9, radio `--r-md`, hover eleva la tarjeta, la
  carátula se acerca un 7 % y el borde pasa a `--accent`. Toda la tarjeta abre la
  ficha menos sus controles, que son botones de verdad; **el nombre es el botón**,
  y con él vuelven el foco de teclado, el nombre accesible y el tooltip del título
  recortado. Nada de un botón invisible por encima con el contenido en
  `pointer-events: none`: eso apaga los tooltips de todo lo que tape.
- **Fila de logro**: 44px, icono 32×32. Desbloqueado = icono a color + check morado.
  Bloqueado = icono en escala de grises al 40%.
- **Banda de cambios pendientes**: fija abajo, `--bg-elevated`, borde superior morado.
- **Estados vacíos**: un icono trazado en `--text-faint`, una frase, una acción.
  Nunca una pantalla en blanco.
