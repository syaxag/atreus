# Hoja de ruta

Lo que falta para que Atreus deje de ser una herramienta personal y pueda
ponerse en manos de otra gente. En orden, y con el motivo de cada cosa.

El orden no es caprichoso: **los idiomas van primero** porque cada pantalla que
se escriba después con el texto incrustado hay que rehacerla luego. Traducir es
mecánico; retraducir lo que ya se hizo mal es trabajo tirado dos veces.

---

## 1. Idiomas · *en marcha*

Toda la interfaz está en castellano escrita dentro del JSX. Para repartir la
aplicación hace falta, como mínimo, inglés.

- [x] **Infraestructura.** Un diccionario por idioma y una función `t()`. Sin
      dependencias nuevas: el proyecto tiene cuatro en total y no merece una
      quinta por esto.
- [x] **El typecheck caza lo que falta.** El diccionario inglés se declara como
      `Record<Clave, string>` sobre las claves del castellano, así que **una
      cadena sin traducir no compila**. Es el mismo truco que ya impide que un
      evento del contrato se quede a medias.
- [x] **Selector en Ajustes**, que aplica al momento y se guarda.
- [x] Primera superficie migrada: barra de título y barra lateral.
- [ ] El resto de las vistas, una por una: Colección, ficha, Trofeos, Rutas,
      Atlas, Taller, Actividad, Ajustes.
- [ ] Fechas y números por idioma. `format.ts` tiene `'es-ES'` incrustado en
      seis sitios.
- [ ] Un tercer idioma es solo un archivo de datos más. Portugués es el
      candidato obvio por tamaño de público.

**Lo que no cubre:** el contenido de fuera. Una guía de Steam en inglés seguirá
en inglés; Atreus traduce su interfaz, no lo que encuentra.

## 2. La portada

Abres Atreus y caes en una parrilla. Steam, Xbox o PSNProfiles te reciben con
*qué estás jugando, qué tienes a un paso del platino, qué hiciste ayer*. Atreus
**ya tiene todos esos datos** —resúmenes, actividad, horas, siguiente logro— y
no los compone en ninguna parte. Es la pieza que más cambiaría la sensación de
la aplicación por lo poco que cuesta: no hay que calcular nada nuevo.

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
