# Lo que viene — fases 7 a 12

Continuación de [ROADMAP.md](ROADMAP.md), que cubre las fases 0 a 6 ya cerradas.
Mismo reparto: **Lado A** backend, **Lado B** interfaz, sin solaparse.

## Dónde estamos de verdad

| Módulo | Estado |
|---|---|
| Biblioteca | ✅ 16 juegos, 4 plataformas, carátulas |
| Logros | ✅ **escritura verificada en la cuenta real** y revertida |
| Mods | ✅ instalar, desplegar, purgar, perfiles, descubrir |
| Motor de cheats | ⚠️ verificado contra un proceso de prueba, **nunca contra un juego** |
| Buscador de memoria | ⚠️ igual |
| Cheats existentes | ❌ **cero**. Ningún juego tiene patrones resueltos |
| Actualización | ✅ contenido · ⚠️ app sin servidor |

Lo de arriba es el mapa honesto: lo que falta no es sobre todo código, sino
**verificación contra juegos reales** y **datos**.

---

## FASE 7 — Cerrar lo que nunca se probó 🔴 *bloqueada por ti*

Es la fase más importante y la única que **no puedo hacer solo**: necesita un
juego abierto. Todo lo demás de esta lista puede esperar; esto no, porque hasta
que ocurra el motor de cheats es código bonito sin evidencia.

### Sesión en vivo (30-40 min contigo)
1. Abrir un juego single-player: **Balatro** es el mejor candidato.
2. Buscar un valor visible en pantalla (dinero) con el buscador.
3. Filtrar hasta aislar la dirección.
4. Escribir en ella y **verlo cambiar en pantalla**.
5. Convertirla en un `resolve` y guardarla.
6. Enganchar el trainer y **activar el cheat con su hotkey**.
7. Comprobar el congelado: gastar dinero y ver que vuelve solo.

### Lo que valida
- `attach` contra un proceso real de juego, no de prueba
- Escaneo AoB sobre gigabytes reales, con tiempos reales
- Que una ruta derivada **sobreviva a cerrar y reabrir el juego** (lo crítico)
- Hotkeys globales disparando de verdad, con el juego en primer plano
- El bucle de congelado a 60 ms contra un juego que reescribe el valor

### Lado A — lo que puedo dejar listo antes
- Registro detallado de la sesión de trainer, para diagnosticar si algo falla.
- `resetAll` probado sobre un juego sin nada que perder.

**Riesgo:** medio. Puede que la dirección de Balatro esté detrás de una cadena de
punteros de más de un nivel, y el buscador solo hace uno. Si pasa, sale la
FASE 10 antes de tiempo.

---

## FASE 8 — Del buscador a la definición, sin copiar y pegar

Hoy el buscador te da un JSON y **tú tienes que editar el archivo a mano**. Es un
hueco que abrí yo: el camino existe pero está roto por la mitad.

### Lado A — backend
1. `scanner.saveAsCheat(gameId, resolve, meta)` — escribe el cheat en la
   definición de la **capa de usuario**, creándola si no existe, sin tocar la de
   fábrica.
2. Fusión inteligente: si el cheat ya existe por `id`, se actualiza su `resolve`
   en vez de duplicarlo.
3. Validar contra `_schema.json` antes de escribir.

### Lado B — interfaz
1. En el panel de conversión, botón **"Guardar como cheat"** en vez de solo copiar.
2. Formulario mínimo: nombre, grupo, tipo, hotkey, si congela.
3. Al guardar, saltar a la pestaña Cheats con el cheat nuevo ya listado.

**Por qué importa:** cierra el ciclo. Encontrar → guardar → usar, sin salir de la
app. Sin esto, el buscador es una herramienta suelta.

**Esfuerzo:** Lado A media · Lado B media. **Riesgo:** bajo.

---

## FASE 9 — Dependencias de mods

**Fallo de corrección, no una mejora.** 65 de los 96 mods de Balatro declaran
dependencias: *Fabula* necesita Lovely y Steamodded. Hoy enseño el número y no
hago nada, así que instalar uno suelto deja algo que el juego no carga.

### Lado A — backend
1. Resolver el árbol de dependencias de Thunderstore (`owner-nombre-version`).
2. `mods.installRemote` instala también lo que falte, en orden.
3. Detectar ciclos y dependencias que no existen en el catálogo.
4. Al desinstalar, avisar de qué mods se quedan colgados.
5. Marcar los mods que están solo porque otro los necesita.

### Lado B — interfaz
1. Antes de instalar, enseñar **"esto instalará también: Lovely, Steamodded"**.
2. Badge de "dependencia" en la lista, distinto de los que elegiste tú.
3. Al desinstalar algo del que dependen otros, decirlo claramente.

**Esfuerzo:** Lado A alta · Lado B media. **Riesgo:** medio — resolver versiones
tiene esquinas.

---

## FASE 10 — Buscador más capaz

Las tres limitaciones que ya conozco y documenté:

### Lado A — backend
1. **Búsqueda de valor desconocido.** Hoy la primera pasada exige un número
   exacto. Con instantánea de memoria se puede empezar por "no sé cuánto es" y
   filtrar solo por cambió/no cambió. Es lo que hace falta para barras de vida
   que no muestran número.
2. **Cadenas de punteros de varios niveles.** Hoy solo un salto. Con dos o tres
   se cubren casi todos los juegos modernos.
3. **Búsqueda de rango** (`entre X e Y`) y de decimales con tolerancia, porque un
   `float` casi nunca es exactamente lo que muestra la pantalla.
4. Guardar y recuperar sesiones de búsqueda, para no empezar de cero.

### Lado B — interfaz
1. Modo "valor desconocido" con su explicación.
2. Ver el valor en vivo, refrescando, para ver cuál se mueve al jugar.
3. Marcar direcciones como favoritas mientras se filtra.

**Esfuerzo:** Lado A alta · Lado B media. **Riesgo:** medio-alto — la instantánea
de memoria de un juego grande puede ser de gigabytes y hay que trocear bien.

---

## FASE 11 — Seguridad de los logros

Ahora mismo, "Marcar todos" + Guardar **no tiene vuelta atrás**. Escribe 547
logros en tu perfil y no hay deshacer. Eso me incomoda.

### Lado A — backend
1. Instantánea automática del estado (logros + estadísticas) **antes** de cada
   escritura, en `%APPDATA%/Atreus/backups/<appid>/<fecha>.json`.
2. `steam.restore(appId, snapshot)` para volver a un punto anterior.
3. Retención: conservar las últimas N.

### Lado B — interfaz
1. Historial de escrituras por juego, con fecha y cuántos cambios.
2. Botón de restaurar, con confirmación.
3. Avisar antes de una escritura masiva: *"vas a cambiar 213 logros"*.

**Esfuerzo:** ambas medias. **Riesgo:** bajo. **Valor:** alto — es la única parte
de la app que toca algo tuyo que es público.

---

## FASE 12 — Distribución y pulido

### Lado A — backend
1. **Auto-actualización de verdad**: añadir `publish` y publicar una release.
   Tres líneas, pero hace falta decidir dónde. Ver [UPDATING.md](UPDATING.md).
2. **Icono en el `.exe`**: hoy se queda el de Electron porque desactivé la fase de
   firma. Se arregla activando Modo Desarrollador en Windows, o firmando.
3. Proveedor de **Nexus Mods** — el catálogo más grande. Necesita clave de API y
   tiene límites de descarga para cuentas gratuitas.
4. Más definiciones de juego: Steam Workshop para los juegos que lo usan.

### Lado B — interfaz
1. Virtualizar las listas de mods y de resultados del buscador, que hoy cortan a 400.
2. `Ctrl+K` para saltar a un juego.
3. Repaso de accesibilidad: foco, orden de tabulación, lectores de pantalla.
4. Estado vacío de la biblioteca cuando no hay ninguna plataforma instalada.

**Esfuerzo:** ambas medias. **Riesgo:** bajo.

---

## Orden que recomiendo

```
7  ──► 8  ──► 11 ──► 9  ──► 10 ──► 12
│      │      │      │      │      │
│      │      │      │      │      └─ pulido, cuando lo demás esté sólido
│      │      │      │      └─ el buscador ya sirve; esto lo hace cómodo
│      │      │      └─ corrección real, pero nada está roto hasta que
│      │      │         instalas un mod con dependencias
│      │      └─ toca tu perfil público: red de seguridad antes de usarlo mucho
│      └─ cierra el ciclo del buscador; sin esto la 7 no se aprovecha
└─ hasta que esto pase, el motor de cheats no tiene evidencia
```

La 7 primero porque **todo lo demás construye sobre algo sin verificar**. Si el
trainer falla contra un juego real, las fases 8 y 10 cambian de forma.

---

## Cómo lanzar las dos sesiones

**Sesión 1 — Lado A:**

> Te encargas del backend (Lado A) del proyecto Atreus en
> `C:\Users\Syax_\Videos\AtreusCheat`. Lee `docs/NEXT.md`, `docs/ARCHITECTURE.md`
> y `docs/CONTRACT.md`. Implementa la FASE 8 de la columna "Lado A".
> Solo escribes en `src/main/**`, `src/preload/**` y `data/**`.
> `src/shared/**` solo se amplía, nunca se cambia lo que ya hay, y se anota en
> `CONTRACT.md`. Cada cosa que añadas necesita su prueba en `test/`.

**Sesión 2 — Lado B:**

> Te encargas de la interfaz (Lado B) del proyecto Atreus en
> `C:\Users\Syax_\Videos\AtreusCheat`. Lee `docs/NEXT.md`, `docs/DESIGN.md` y
> `docs/CONTRACT.md`. Implementa la FASE 8 de la columna "Lado B", contra el mock.
> Solo escribes en `src/renderer/**`. Si añades una llamada nueva, el mock la
> implementa también.

---

## Reglas que ya aprendimos

Cosas que costaron una sesión de depuración y no deberían repetirse:

- **Nada de heredocs de bash con barras invertidas.** Se comen los escapes. Usar
  la herramienta de escritura de archivos.
- **Ampliar el contrato es seguro; cambiarlo no.** El `typecheck` avisa si el
  mock se queda atrás, y eso es una función, no una molestia.
- **El mock no debe mentir.** Si simula algo distinto de lo que hace el backend,
  la interfaz parece rota donde no lo está.
- **Verificar con el paquete, no solo con el build.** Tres fallos aparecieron
  solo al ejecutar la app instalada.
- **Preferir un fallo explicado a un resultado inventado.** El buscador que dice
  "no hay ruta estable" vale más que uno que devuelve una que no funciona.
