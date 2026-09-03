# Hoja de ruta

Lo que falta para que Atreus deje de ser una herramienta personal y pueda
ponerse en manos de otra gente. En orden, y con el motivo de cada cosa.

El orden no es caprichoso: **los idiomas van primero** porque cada pantalla que
se escriba después con el texto incrustado hay que rehacerla luego. Traducir es
mecánico; retraducir lo que ya se hizo mal es trabajo tirado dos veces.

---

## 1. Idiomas · *hecho, salvo el tercer idioma*

Toda la interfaz estaba en castellano escrita dentro del JSX. Para repartir la
aplicación hacía falta, como mínimo, inglés. Ya lo habla entero: la ventana, el
menú de la bandeja, las fechas, los números y la prosa que antes fabricaba el
proceso principal.

- [x] **Infraestructura.** Un diccionario por idioma y una función `t()`. Sin
      dependencias nuevas: el proyecto tiene cuatro en total y no merece una
      quinta por esto.
- [x] **El typecheck caza lo que falta.** El diccionario inglés se declara como
      `Record<Clave, string>` sobre las claves del castellano, así que **una
      cadena sin traducir no compila**. Es el mismo truco que ya impide que un
      evento del contrato se quede a medias.
- [x] **Selector en Ajustes**, que aplica al momento y se guarda.
- [x] Primera superficie migrada: barra de título y barra lateral.
- [x] Colección: cabecera, filtros, orden, buscador y avisos.
- [x] La ficha del juego, entera.
- [x] Trofeos, incluido el aviso de riesgo, que es la prosa que más importa.
- [x] **Fechas y números siguen al idioma.** `format.ts` guarda la configuración
      regional en una variable de módulo y la fija el renderer al cambiar el
      ajuste. `span()` no lo cubría —compone "2 años y 3 meses" a mano, cosa que
      `Intl` no hace— y recibe las palabras del mismo diccionario.
- [x] Rutas, Atlas y Taller. Con ellas cayeron dos cosas que hablaban castellano
      desde fuera del JSX: la escala de rareza, que `rarity()` devolvía como
      palabra fija, y los millares del catálogo de mods.
- [x] Actividad y el cuerpo de Ajustes, y con ellos la celebración del platino
      y el recibimiento de la Colección, que se habían quedado atrás.
- [x] **El registro de Actividad guarda claves, no frases.** Apuntaba
      *"Biblioteca actualizada"* ya escrito, así que cambiar de idioma dejaba
      el pasado de la sesión en el anterior. Ahora guarda la clave y sus
      huecos y se traduce al pintarlo. Es, en pequeño, el contrato que le
      falta al backend.
- [x] **La aritmética del platino deja de escribir prosa.** `difficultyOf()`
      manda su tramo (`demanding`) en vez de su etiqueta (*Exigente*), y
      `estimateOf()` manda con qué se compone la explicación en vez de la
      explicación. La frase la arma `lib/platino.ts`, en el renderer. De
      propina, los números salen con la configuración regional puesta: la
      dificultad decía "0,30 %" también en inglés, porque la coma se la ponía
      el backend a mano.
- [x] **El backend deja de mandar prosa.** Las fuentes del informe viajan como
      `SourceRef`, el porqué del progreso como `Notice`, la comprobación de
      una clave como `status`, los avisos del proceso principal como
      `ToastNotice` y el escaneo solo con su fase. La frase la arman
      `lib/platino.ts` y `lib/aviso.ts`. Dos excepciones a propósito: la nota
      de la ficha de un juego, que la escribió quien hizo esa ficha, y el
      detalle técnico de un fallo del sistema. Atreus no traduce lo que
      encuentra.
- [x] **El menú de la bandeja.** Los diccionarios se mudan a `shared/i18n`,
      que es donde tenían que estar: el proceso principal también habla. Los
      ajustes avisan de sus cambios y el menú se vuelve a montar, así que
      cambiar de idioma no obliga a reiniciar.
- [x] **Repasado con la app delante**, en los dos idiomas y sobre la
      biblioteca real. Salieron nueve rezagados que el typecheck no podía
      ver —`Multijugador`, `Platino`, `Guardar en Steam`, los de la pantalla
      de fallo— porque eran cadenas sueltas con su clave ya escrita y sin
      usar, y dos números que llevaban la coma puesta a mano.

      Lo que **no** se traduce: los tres objetivos con los que nace la lista
      de una partida. Se escriben en tu disco la primera vez y los editas tú;
      traducirlos al pintarlos pisaría lo que hayas cambiado. Son datos
      tuyos, no interfaz.
- [ ] Un tercer idioma, ahora sí, es solo un archivo de datos más.
      Portugués es el candidato obvio por tamaño de público.

**Lo que no cubre:** el contenido de fuera. Una guía de Steam en inglés seguirá
en inglés; Atreus traduce su interfaz, no lo que encuentra.

## 2. La portada · *hecha*

Abrías Atreus y caías en una parrilla. Ahora la aplicación se abre por la
portada, que compone lo que ya sabía y estaba repartido:

- **Sigue donde lo dejaste** — el juego que está abierto ahora mismo, o el
  último que tocaste. Con su progreso y **por qué logro seguir**, que es lo
  único que se pide de más: un informe, del juego que ya estabas jugando y
  cacheado media hora. Es lo que convierte la tarjeta en una decisión en vez
  de un recordatorio.
- **Lo que tienes empezado**, del más cerca del platino al más lejos.
- **Lo último que tocaste**, que es lo que se quedó por el camino.

Se llamó un rato *"a un paso del platino"*, como decía esta hoja. Con una
biblioteca de verdad delante listaba un juego al 2 %: el orden sí pone delante
lo más cerca, pero el título prometía una cercanía que depende de tu
biblioteca, no de Atreus. El bloque se llama ahora por lo que contiene.

Queda pendiente lo que no se puede saber sin usarla más tiempo: si tres
bloques son los tres que hacen falta, o si sobra el último.

## 3. Tu perfil

Logros totales, horas, el trofeo más raro que tienes, media de completado,
racha. El material está en los informes; falta la pantalla que lo sume.

## 4. La tarjeta, con más chicha

Hoy dice progreso y horas. Le falta la dificultad del platino y cuál es el
siguiente logro, que es lo que decide si abres ese juego o el de al lado.

## 5. Publicar

Por orden de lo que de verdad sirve:

1. **Firmar el ejecutable.** Es lo único que hace que Windows deje de avisar
   de que la aplicación es de origen desconocido, y lo que permite detectar si
   alguien la manipula. Requiere un certificado de firma de código, que se paga.
2. **Licencia.** Un `LICENSE` restrictivo es lo que da derecho a reclamar. Es
   la vía real contra que alguien reetiquete la aplicación como suya.
3. **Actualizaciones.** `electron-updater` ya está montado; falta el feed.

**Lo que no se puede, y conviene saberlo antes de gastar esfuerzo:** impedir que
alguien lea el código. Electron entrega el JavaScript al usuario. El `.asar` no
es un cifrado, es un contenedor: se abre con un comando. Ofuscar o compilar a
bytecode sube el listón para el curioso y no detiene a nadie con ganas. La
protección real de una aplicación de escritorio es legal y de marca, no técnica.

**Y una decisión que es tuya:** Atreus escribe logros en Steam. Para uso propio
no tiene mayor recorrido; repartirlo a mucha gente lo pone en la misma categoría
que Steam Achievement Manager, que existe en abierto desde hace años pero no
deja de ser lo que es. Conviene decidirlo a sabiendas, no descubrirlo después.

## 6. Cobertura del Atlas

MapGenie cubre 197 juegos y los mapas interactivos de Fandom añaden bastantes
más, pero **no existe una fuente universal**: un mapa interactivo tiene que
haberlo dibujado alguien. Para lo que no cubre nadie ya está el añadido a mano.
Lo que sí queda por hacer es que ese añadido se pueda compartir, para que el
mapa que encuentre uno lo tengan todos.

---

## Hecho

- La Colección con pósters verticales, que es lo que la hace parecer una
  estantería y no una tabla.
- La ficha con su cabecera de arte, anillo de progreso y escala de rareza.
- El lector de guías con índice, avance y tipografía de lectura.
- El Atlas: mapas de Fandom, y dejar de tapar un mapa que ya funcionaba.
- La celebración, que anunciaba como nuevos platinos de hace meses.
- La barra lateral en dos grupos, con el juego en medio.
