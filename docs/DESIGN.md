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

## Layout de la ventana

```
┌──────────────────────────────────────────────────────────┐
│ ▓ Atreus                                       ─  □  ✕   │  40px, arrastrable
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│ Sidebar  │  Contenido                                    │
│ 220px    │                                               │
│          │                                               │
│ Bibliot. │                                               │
│ Logros   │                                               │
│ Mods     │                                               │
│ Cheats   │                                               │
│          │                                               │
│ ──────── │                                               │
│ Ajustes  │                                               │
└──────────┴───────────────────────────────────────────────┘
```

- Ventana **frameless**: la barra de título es nuestra (`-webkit-app-region: drag`).
  Los botones llevan `no-drag`.
- Sidebar: sin iconos de colores. Item activo = texto blanco + barra morada de 2px
  a la izquierda + fondo `--accent-soft`.

## Componentes: notas concretas

- **Toggle**: pista 36×20, `--border-strong` apagado → `--accent` encendido.
- **Tarjeta de juego**: carátula 3:4, radio `--r-md`, hover eleva `translateY(-2px)`
  y el borde pasa a `--accent`.
- **Fila de logro**: 44px, icono 32×32. Desbloqueado = icono a color + check morado.
  Bloqueado = icono en escala de grises al 40%.
- **Banda de cambios pendientes**: fija abajo, `--bg-elevated`, borde superior morado.
- **Estados vacíos**: un icono trazado en `--text-faint`, una frase, una acción.
  Nunca una pantalla en blanco.
