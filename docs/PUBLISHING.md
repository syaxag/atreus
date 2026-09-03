# Publicar Atreus

Lo que hace falta para que la aplicación pueda salir de este equipo. En orden
de lo que de verdad sirve, no de lo que apetece hacer.

Para **actualizar** una versión ya publicada, ver `UPDATING.md`: son cosas
distintas y confundirlas lleva a reempaquetar por todo.

---

## 1. Firmar el ejecutable

Es lo único que hace que Windows deje de avisar de que la aplicación es de
origen desconocido, y lo que permite detectar si alguien la manipula.

### Qué hace falta

Un **certificado de firma de código**, que se compra. Un OV cuesta del orden de
200-400 € al año; un EV, más, y a cambio evita también la pantalla de
SmartScreen desde el primer día en vez de tras ganar reputación. Sin
certificado no hay firma: no es un ajuste, es una compra.

### Cómo se enciende

No hay que tocar nada. Basta con que el certificado esté en el entorno:

```bash
CSC_LINK=file:///C:/ruta/certificado.pfx
CSC_KEY_PASSWORD=…
npm run dist
```

`electron-builder.cjs` mira esas variables y decide: con certificado enciende
`signAndEditExecutable`, y sin él lo deja apagado. Por eso el empaquetado vive
en un archivo `.cjs` y no en `package.json`: tiene una decisión que tomar, y un
interruptor que hay que acordarse de mover el día que exista el certificado es
una trampa puesta a propósito.

### Qué cambia al encenderla

Ese interruptor hace **dos cosas a la vez**, y saberlo evita un fallo feo:

1. Firma el ejecutable.
2. Le pone también el icono y los datos de versión, que hoy hace
   `scripts/after-pack.cjs` con `rcedit`.

Por eso `after-pack.cjs` **se aparta cuando hay certificado**. No es un detalle
de estilo: ese paso corre *después* de la firma, `rcedit` modifica el binario, y
modificar un binario firmado invalida la firma. El instalador se construiría
igual y el estropicio solo se vería en la máquina de quien lo instala.

### El obstáculo que queda

Para lo segundo, electron-builder descarga su paquete `winCodeSign`, que trae
enlaces simbólicos de macOS. Crear un enlace simbólico en Windows exige modo
desarrollador o permisos de administrador; sin eso la descompresión falla, el
paso se salta **en silencio** y el ejecutable se queda con el icono y el nombre
de Electron. Eso es lo que se veía en el instalador antes de que `rcedit`
tomara el relevo.

Así que el día que haya certificado hará falta además: **modo desarrollador de
Windows activado**, o construir desde una consola de administrador, o hacerlo en
un runner de CI donde eso no sea un problema.

---

## 2. Licencia

Hecho: `LICENSE`, en castellano e inglés.

Es una licencia **restrictiva**: se concede usar la aplicación, no
redistribuirla ni publicarla bajo otro nombre. Eso es lo que da derecho a
reclamar si alguien la reetiqueta como suya, que es el riesgo real de una
aplicación de escritorio.

Va en tres sitios, a propósito:

- `LICENSE` en la raíz del repositorio.
- El instalador la enseña y pide aceptarla (`nsis.license` en
  `electron-builder.cjs`).
- Viaja junto a la app instalada (`extraResources`), no solo dentro del
  instalador.

**Esto no es asesoramiento legal.** El texto dice con claridad qué se permite y
qué no, y sirve como base; si algún día hay dinero de por medio, que lo mire un
abogado.

### Lo que la licencia no puede hacer

Impedir que alguien lea el código. Electron entrega el JavaScript al usuario:
el `.asar` no es un cifrado, es un contenedor, y se abre con un comando.
Ofuscar o compilar a bytecode sube el listón para el curioso y no detiene a
nadie con ganas. **La protección real de una aplicación de escritorio es legal
y de marca, no técnica**, y por eso este punto va antes que cualquier idea de
ofuscación.

---

## 3. Actualizaciones

`electron-updater` ya está montado y `npm run dist` genera el `latest.yml`. Lo
que falta no es código: es **un sitio donde publicar** que controles.

El procedimiento entero —qué archivos subir, cómo apuntar la app a una carpeta
HTTPS desde Ajustes, y cómo automatizarlo con releases de GitHub— está en
`UPDATING.md`, sección 3.

---

## Antes de cada publicación

```bash
npm run dist
```

que encadena `typecheck`, los tests y el empaquetado. Si algo de eso falla, no
hay instalador: es a propósito.

Para probar el empaquetado sin construir el instalador —más rápido, y suficiente
para ver si el ejecutable sale bien marcado—:

```bash
npm run pack
```

Comprobar además, con la app **instalada** y no en desarrollo:

- El icono y el nombre en el Administrador de tareas dicen «Atreus», no
  «Electron».
- Ajustes → Catálogo → Abrir carpeta lleva a `%APPDATA%/Atreus/data/games`.
- Desinstalar no borra `%APPDATA%/Atreus`: las definiciones, los mods y los
  perfiles sobreviven.
