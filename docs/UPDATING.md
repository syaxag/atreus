# Qué se actualiza y cómo

Hay **tres cosas distintas** que se actualizan por caminos distintos. Confundirlas
es lo que lleva a pensar que hay que reempaquetar para todo, y no es así.

| Qué | Cómo | ¿Reempaquetar? | Estado |
|---|---|---|---|
| **Fichas de juego** (`data/games/*.json`) | Dejar el JSON en la carpeta, o Ajustes → Catálogo → Sincronizar | **No** | ✅ verificado en la app instalada |
| **Mods** | Mods → Descubrir, o arrastrar el archivo | **No** | ✅ verificado con catálogos reales |
| **La app** (código) | Auto-actualización desde Ajustes | Sí, solo la primera vez | ⚠️ requiere publicar un feed HTTPS |

---

## 1. Fichas de juego — sin reempaquetar

Las definiciones viven en dos capas y **la tuya manda**:

```
resources/data/games/     de fábrica, se sustituye al actualizar la app
%APPDATA%/Atreus/data/games/   tuya, gana, y sobrevive a las actualizaciones
```

### Añadir o corregir un juego

1. Ajustes → Catálogo → **Abrir carpeta**.
2. Dejar ahí `steam.<appid>.json` siguiendo `data/games/_schema.json`.
3. Ya está. La carpeta se vigila: el cambio se nota **al momento**, sin reiniciar.

Si el JSON está mal, el registro dice la línea y la columna exactas y el resto
sigue funcionando.

**Verificado en la app empaquetada**, no solo en desarrollo:

```
cambio detectado en las definiciones, recargando
definiciones: 11 (11 de fábrica, 1 del usuario, las del usuario mandan)
```

### Traerlas de fuera

`settings.catalogSource` admite tres formas:

- una **carpeta local**;
- una **URL a un `.zip`** — vale el de un repositorio de GitHub
  (`.../archive/refs/heads/main.zip`); se recogen los `*.json` a cualquier
  profundidad;
- una **URL a un `.json`** suelto.

Sincronizar es idempotente: si nada cambió, no reescribe nada. Los archivos que
no son JSON válido se descartan con su motivo, sin tocar los buenos.

### Catálogo versionado recomendado

Además de ZIP y JSON individuales, Atreus acepta un manifiesto
`atreus.catalog/v1`. Incluye versión, fecha, URL HTTPS y SHA-256 de cada
definición. Usa
[`data/catalog.manifest.example.json`](../data/catalog.manifest.example.json)
como plantilla para el feed.

## 2. Mods — sin reempaquetar

Ya vivían fuera del paquete: se instalan en `%APPDATA%/Atreus/mods/<gameId>/` y
se despliegan al juego por enlace duro.

Además, **Mods → Descubrir** consulta el catálogo público del juego:

| Proveedor | Cubre |
|---|---|
| Thunderstore | Balatro, PEAK, y 314 comunidades más |
| Geode | Geometry Dash |

Añadir cobertura para otro juego es una línea en su definición:

```jsonc
"mods": { "provider": { "kind": "thunderstore", "community": "balatro" } }
```

---

## 3. La app — esto sí necesita empaquetar

Aquí no hay magia: cambiar el código exige generar un `.exe` nuevo.

```bash
npm run dist
```

### Estado actual

Atreus consulta una carpeta HTTPS de releases al arrancar. Si se activa la
descarga automática, baja la versión nueva en segundo plano y la instala al
cerrar. El usuario no vuelve a descargar ni ejecutar instaladores manualmente.

La primera instalación sigue siendo mediante el `.exe`. El desinstalador no
borra `%APPDATA%/Atreus`, así que las definiciones, los mods y los perfiles
sobreviven.

### Cómo activarla

Hace falta un sitio donde publicar que controles. Tras crear una release, en
**Ajustes → Actualizaciones de Atreus → Origen de versiones** se pega la URL de
la carpeta HTTPS que contiene los artefactos. No hace falta recompilar la app
para cambiar de servidor.

El directorio debe contener, como mínimo, los archivos que produce el builder:

```
latest.yml (Atreus lo genera con `npm run dist`)
Atreus-<version>-setup.exe
Atreus-<version>-setup.exe.blockmap
```

Con un repositorio de GitHub también se puede fijar `publish` en
`package.json` para automatizar la publicación:

```jsonc
"build": {
  "publish": [
    { "provider": "github", "owner": "TU-USUARIO", "repo": "atreus" }
  ]
}
```

Después:

1. `npm run dist` genera el instalador **y** `latest.yml`.
2. Se sube todo a una release de GitHub con el tag `v0.1.0`.
3. La app ya encuentra las versiones nuevas sola.

Para un repositorio privado hace falta además un token en `GH_TOKEN`. Si prefieres
no usar GitHub, `{"provider": "generic", "url": "https://…"}` sirve con cualquier
carpeta servida por HTTP.

El feed configurable de Ajustes tiene prioridad; el `app-update.yml` generado
por `publish` sigue siendo compatible para instalaciones antiguas.
