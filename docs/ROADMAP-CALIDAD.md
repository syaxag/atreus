# Hoja de ruta de calidad

Quince cosas que salieron de revisar el proyecto entero con los tests pasando y
el typecheck limpio. No son funcionalidad: son los bordes que quedan cuando lo
que se ve por delante ya funciona.

El orden **no es por gravedad, es por dependencia**. Lo primero es el arnés —CI,
linter, compilador más estricto—, porque cada arreglo posterior se comprueba con
él; hacerlo al revés significa arreglar catorce cosas a ciegas y montar la red
encima. Lo último son las vistas, que es donde más código se mueve y donde más
falta hace tener todo lo demás en verde.

---

## Fase 0 · El arnés

Nada de esto cambia lo que hace Atreus. Cambia lo que Atreus deja pasar.

### 11. `engines` en package.json

`npm test` usa `--experimental-strip-types`, que exige Node ≥ 22.6. Sin
declararlo, en otro equipo la suite falla con un error de sintaxis que no
menciona la versión de Node por ninguna parte.

**Comprobación:** `npm ci` avisa si la versión no cumple.

### 14. El compilador, más estricto

Ya iba con `strict` y `noUncheckedIndexedAccess`. Se añaden cuatro que en un
código de este nivel salen gratis y cazan lo que la revisión encuentra a mano:

- `noUnusedLocals` / `noUnusedParameters` — código muerto.
- `noImplicitOverride` — un método que cree que sobreescribe y no.
- `noFallthroughCasesInSwitch` — el `case` sin `break`.

`exactOptionalPropertyTypes` se queda fuera **a propósito**: obliga a distinguir
"la clave no está" de "la clave vale `undefined`" en cada objeto parcial que
cruza el IPC, y eso son cientos de cambios mecánicos que no arreglan ningún
defecto real. Se anota aquí para no volver a plantearlo cada seis meses.

**Comprobación:** `npm run typecheck`.

### 9. CI y linter

Había 266 tests, una prueba de humo y un typecheck, y **nada los ejecutaba salvo
la memoria de quien programa**. Ahora:

- **ESLint** con `typescript-eslint` y `eslint-plugin-react-hooks`. La regla que
  de verdad importa es `react-hooks/exhaustive-deps`: es la que habría cazado
  sola la mitad de la fase 1.
- **GitHub Actions** en `push` y `pull_request`: `lint`, `typecheck` y `test`.

La prueba de humo **no entra en CI**: arranca Electron con ventana y necesita
Windows con sesión gráfica. Se queda como está, para ejecutarla a mano antes de
publicar.

**Comprobación:** `npm run lint`.

---

## Fase 1 · Los dos defectos

Lo único de la lista que un usuario nota sin saber que existe.

### 1. El calentamiento se saltaba juegos al jugar

`warmup.ts` recorría la cola y, al encontrar una partida abierta, dormía un
minuto y hacía `continue`. Pero `continue` **avanza el iterador**: ese juego no
se reintentaba nunca. El comentario decía justo lo contrario de lo que hacía el
código. Con una partida abierta, la cola entera se descartaba a razón de un
minuto por juego, en silencio, y esos juegos se quedaban sin resumen hasta un
escaneo manual o un reinicio.

Ahora el bucle va por índice y **no avanza** mientras hay una partida: reintenta
el mismo juego. Con un tope de esperas por juego, para que una sesión de ocho
horas no deje el calentamiento girando para siempre.

**Comprobación:** `test/warmup.test.ts` — la cola con una partida abierta no
pierde ningún juego.

### 2. Carreras al cambiar de juego rápido

Cinco vistas cargaban con `async` sin comprobar si la respuesta seguía siendo
vigente. Abrir el juego A y saltar a B antes de que Steam contestara pintaba los
logros de A sobre B. El patrón bueno ya existía en `HomeView` —un `let vigente`
en el efecto—, pero solo ahí.

Se extrae a `lib/vigencia.ts`: `useCarga()`, un hook que envuelve la carga y
**descarta lo que llega tarde**. Una sola implementación, y la fase 4 la reutiliza
al partir las vistas.

**Comprobación:** `test/vigencia.test.ts` — una respuesta lenta de la petición
anterior no pisa a la nueva.

---

## Fase 2 · El filo

Ordenadas por lo que puede pasar de verdad, no por su nombre.

### 3. `fileName` de un catálogo remoto entraba sin sanear en una ruta

`join(staging, ready.fileName)`, con `fileName` viniendo de GameBanana o
Modrinth —y con el objeto entero llegando además del renderer por IPC sin
validar—. Un `..\..\algo.exe` escribía fuera del temporal.

Se sanea con `basename()` y se exige `https:` en la URL de descarga, que es lo
que ya hacía el actualizador y aquí faltaba.

**Comprobación:** `test/mods-remoto.test.ts`.

### 4. El catálogo se sincronizaba por HTTP plano

Las definiciones deciden qué ejecutable se lanza, con qué argumentos y a qué
carpeta se despliegan mods. El actualizador exigía HTTPS y el manifiesto
también; el origen del catálogo era el hueco por el que entraba todo.

**Comprobación:** `test/sync-origen.test.ts`.

### 5. `mods.root` no se validaba

`validate()` comprobaba `id`, `name` y que los mapas fueran https, pero
`mods.root` pasaba entero a `resolveRoot()`, que expande `%VAR%` y aceptaba
cualquier ruta absoluta. Una definición podía apuntar el despliegue a
`%SystemRoot%\System32`, y `purge()` borra y restaura ahí.

Ahora la raíz resuelta tiene que caer bajo el directorio del juego o bajo una de
las carpetas del usuario (`%APPDATA%`, `%LOCALAPPDATA%`, `%USERPROFILE%`).
Lo que no cae, se rechaza con el motivo escrito.

**Comprobación:** `test/deploy-raiz.test.ts`.

### 8. Los ajustes aceptaban cualquier parche

`setSettings(patch)` tomaba un parcial arbitrario del renderer sin comprobar
nada: un valor mal tipado se persistía y sobrevivía al reinicio. Ahora cada
clave tiene su validador; lo que no encaja se descarta con un aviso en el
registro y el resto del parche se aplica igual.

**Comprobación:** `test/settings-validar.test.ts`.

### 6. Las claves de API se guardaban en claro

`steamWebApiKey` y `xboxApiKey` iban tal cual en `settings.json`. Ahora se
cifran con `safeStorage` (DPAPI en Windows) al persistir y se descifran al leer.

Con tres cuidados que importan más que el cifrado en sí:

- si `safeStorage` no está disponible, se guarda en claro y **se dice en el
  registro**, en vez de perder la clave;
- una clave ya guardada en claro se lee igual y se cifra sola al siguiente
  guardado, así que nadie tiene que volver a pegarla;
- la forma de `Settings` no cambia: el cifrado vive en el borde del disco.

**Comprobación:** `test/settings-secretos.test.ts`.

### 7. El `.7z` se extraía a ciegas

El camino del `.zip` tenía `safeJoin()` contra zip slip, bien explicado. El
`.7z` delegaba todo en `7za x` sin comprobar nada después. 7-Zip suele rechazar
`..`, pero eso era una confianza sin escribir. Ahora, tras extraer, se recorre
el destino y se descarta lo que sea enlace o quede fuera.

**Comprobación:** `test/archive-7z.test.ts`.

### 15. CSP: tres directivas que faltaban

`object-src 'none'`, `base-uri 'self'` y `form-action 'none'`. `default-src` no
cubre las dos últimas.

**Comprobación:** `test/csp.test.ts` — lee el HTML de verdad.

---

## Fase 3 · La red bajo lo destructivo

### 10. Tests de lo que puede estropear una instalación

Los 266 tests que había cubrían funciones puras: parsers, formato, i18n,
estimación. `deploy.ts` y `purge()` —enlaces duros, `.atreus-backup`, borrado de
carpetas dentro del directorio de un juego— no tenían ni uno, y son lo único del
proyecto que puede dejar la instalación de otra persona peor de como estaba.

No se podían probar porque la cadena `deploy → store → paths → electron` acaba
importando Electron, que en un runner no existe. La solución sigue la regla que
el proyecto ya tenía escrita: **el que se adapta es el arnés**. El resolver de
tests da un doble de `electron` y `paths` cuelga de un directorio temporal.

Lo que se prueba es el comportamiento, no la implementación:

- desplegar y purgar deja el árbol del juego **byte a byte** como estaba;
- un archivo del juego pisado se respalda y vuelve;
- dos mods que escriben el mismo archivo: gana el del orden más alto, y al
  purgar no queda rastro de ninguno;
- las carpetas que creamos se retiran; las que ya estaban, no.

**Comprobación:** `test/deploy.test.ts`.

---

## Fase 4 · La casa ordenada

### 12. Vistas de ochocientas líneas

`ModsView` tenía 843 líneas y 19 `useState`; `AchievementsView`, 797 y 18. Las
dos mezclaban carga de datos, estado de borrador y presentación.

La carga se saca a hooks —`useLogros`, `useMods`, `useGuias`, `useMapas`— sobre
el `useCarga()` de la fase 1. No es mudar código de sitio: es que el guardia de
vigencia viva en un solo lugar en vez de en cinco, que era el defecto 2.

**Comprobación:** `npm test` (las vistas siguen pintando en jsdom) y `npm run smoke`.

### 13. El `Modal` dejaba escapar el foco

Tenía `role="dialog"`, `aria-modal` y Escape —lo difícil ya estaba—, pero el
tabulador se iba al fondo y al cerrar el foco no volvía al botón que lo abrió.

**Comprobación:** `test/modal.test.ts`.

---

## Lo que se decidió no hacer

- **`exactOptionalPropertyTypes`** — el motivo, arriba en el punto 14.
- **La prueba de humo en CI** — necesita Windows con sesión gráfica; en un
  runner sin pantalla daría rojo por el entorno, no por el código, y un CI que
  falla por costumbre no lo mira nadie.
- **Firmar el ejecutable** — sigue en `ROADMAP.md`, punto 5. Requiere un
  certificado que se paga; no es una tarea, es una compra.
