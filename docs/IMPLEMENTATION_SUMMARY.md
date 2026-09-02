# Atreus — Resumen de implementación

> **Documento histórico.** Describe el proyecto tal como era antes de la
> reestructuración de septiembre de 2026, cuando Atreus dejó de ser un launcher con
> trainer y pasó a ser una aplicación dedicada a los platinos. El motor de cheats y el
> buscador de memoria que se mencionan aquí ya no existen; el historial de git los
> conserva. El estado actual está en [SCOPE.md](SCOPE.md), [README](../README.md) y
> [ARCHITECTURE.md](ARCHITECTURE.md).

Fecha: 2 de septiembre de 2026  
Versión preparada: **0.1.1**

## Objetivo alcanzado

Atreus queda preparado como una aplicación personal para detectar la biblioteca de juegos instalada y concentrar, dentro de la propia app, logros, guías, mapas interactivos, mods y cheats offline compatibles.

Los juegos multijugador o con riesgo de anti-cheat no permiten que Atreus enganche procesos, escanee memoria ni aplique cheats.

## Biblioteca y detección automática

- Detección de Steam, Epic, GOG, Xbox/Microsoft Store, EA App y Battle.net.
- Detección de juegos nuevos y preparación en segundo plano de guías y catálogos de mods.
- Carátulas locales de Steam y fondos visuales por juego.
- Exclusión de aplicaciones que no son juegos del flujo de mods/cheats:
  - Krita.
  - Lossless Scaling.
  - Wallpaper Engine.
  - Minecraft Launcher (se conserva Minecraft Java como juego independiente).
- Detección de actividad de los juegos instalados.

## Guías, logros y mapas

- Buscador integrado de guías, walkthroughs, coleccionables y mods.
- Lector breve dentro de Atreus: los resultados se consultan sin abrir el navegador.
- Atlas nativo con zoom, arrastre, filtros por categoría y progreso local.
- Atlas de rutas de biomas para Dead Cells.
- Checklist/atlas de campaña para Halo: Campaign Evolved.
- Progreso de marcadores separado de partidas y logros reales: no modifica archivos de guardado.
- Lectura de logros de Steam, con iconos y corrección de conversión de estado desbloqueado.

## Mods y perfiles

- Descubrimiento de catálogos públicos:
  - Steam Workshop.
  - Thunderstore.
  - GameBanana.
  - Geode para Geometry Dash.
  - Modrinth para Minecraft Java.
- Instalación reversible: staging propio, detección de conflictos, despliegue y purga.
- Perfiles de mods y orden de carga.
- Steam Workshop se muestra y se mantiene mediante Steam; Atreus no intenta suscribir ni modificar la gestión de Steam.
- Clasificación conservadora de mods que se presentan como menú/debug/trainer para mostrarlos como cheats de catálogo cuando corresponda.

### Minecraft Java

- Detecta `%APPDATA%\\.minecraft\\versions`.
- Reconoce perfiles Fabric, Forge y NeoForge.
- En esta instalación se detectó Fabric **1.20.1**.
- Modrinth se consulta filtrando por cargador, versión y tipo `mod`.
- Sólo al elegir un mod se resuelve y descarga el archivo compatible.
- Los `.jar` se despliegan en `%APPDATA%\\.minecraft\\mods`.

## Cheats y seguridad

- Interfaz de cheats agrupada por categorías, inspirada en una herramienta de personalización, pero implementada de forma propia.
- Bloqueo permanente por título y segunda barrera que detecta módulos anti-cheat cargados.
- Bloqueados: Fortnite, Apex Legends, Rocket League, PEAK y Call of Duty.
- El buscador de memoria usa las mismas barreras que el trainer.
- Los cheats de DOOM: The Dark Ages están en cuarentena hasta que se publique una huella SHA-256 comprobada para el ejecutable exacto.
- La validación de build falla cerrada: sin coincidencia exacta no se escribe memoria.
- No se fabrican cheats universales ni se modifica el progreso de logros del servidor.

## Catálogo actualizable y actualizador

- Definiciones por juego en `data/games/`.
- Capa de catálogo de usuario en `%APPDATA%\\Atreus\\data\\games`, que sobrevive a las actualizaciones.
- Sincronización remota de definiciones y retirada de cheats por política de seguridad.
- Licencias firmadas con Ed25519; la clave privada no se incluye en la aplicación instalada.
- Actualizador in-app con detección, descarga de progreso y reinicio para instalar.
- Manifiesto `latest.yml` con hash SHA-512 del instalador.

Para publicar una actualización, hay que subir el instalador y `latest.yml` al origen HTTPS configurado en Ajustes. La app instalada detectará una versión superior automáticamente.

## Archivos principales añadidos o ampliados

- `src/main/services/mods/minecraft.ts`: detector de perfiles de Minecraft.
- `src/main/services/mods/providers.ts`: proveedor Modrinth y resolución de versiones compatibles.
- `src/main/services/trainer/compatibility.ts`: validación SHA-256 de builds para cheats.
- `src/main/services/catalog/steam.ts` y `others.ts`: filtro de utilidades/lanzadores.
- `data/games/xbox.Microsoft.MinecraftJavaEdition_8wekyb3d8bbwe.json`: integración de Minecraft Java.
- `data/games/steam.2806050.json`: atlas de Halo: Campaign Evolved.
- `data/games/steam.588650.json`: atlas de Dead Cells.
- `data/games/steam.3017860.json`: definición offline de DOOM con protección de compatibilidad.

## Verificación realizada

- `npm test`: **84 pruebas correctas**.
- `npm run typecheck`: correcto.
- JSON de definiciones validado.
- Instalador generado: `release/Atreus-0.1.1-setup.exe`.
- `release/latest.yml` regenerado y verificado contra el hash SHA-512 del instalador.

## Pendientes recomendados

1. Publicar el feed HTTPS de actualizaciones con el instalador 0.1.1 y `latest.yml`.
2. Añadir hashes de builds verificadas al catálogo para habilitar cheats offline de DOOM de forma segura.
3. Añadir un conector autenticado para Nexus Mods si se desea consultar/instalar contenido que exige cuenta o clave API.
4. Ampliar los atlas de Dead Cells, Halo y los siguientes juegos detectados mediante actualizaciones del catálogo.
