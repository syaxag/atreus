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

Está preparado, apagado a propósito y en un solo sitio. En `package.json`:

```jsonc
"win": {
  "signAndEditExecutable": false   // ← poner en true cuando haya certificado
}
```

Con esa opción en `true`, electron-builder firma solo si encuentra el
certificado en el entorno:

```bash
CSC_LINK=file:///C:/ruta/certificado.pfx
CSC_KEY_PASSWORD=…
npm run dist
```

### Por qué está apagado

Por dos motivos que conviene saber antes de tocarlo:

1. **Sin certificado no aporta nada** y sí quita: con `signAndEditExecutable`
   activo, electron-builder se encarga también del icono y los datos de versión
   del `.exe`, y para eso descarga su paquete `winCodeSign`, que trae enlaces
   simbólicos de macOS. Crear un enlace simbólico en Windows exige modo
   desarrollador o permisos de administrador; sin eso la descompresión falla,
   el paso se salta **en silencio** y el ejecutable se queda con el icono y el
   nombre de Electron. Eso es lo que se veía en el instalador.
2. Por eso el icono y la versión los pone `scripts/after-pack.cjs` con
   `rcedit`, que es una dependencia normal y no necesita ningún privilegio.

Al encender la firma habrá que resolver lo mismo: **modo desarrollador de
Windows activado**, o construir desde una consola de administrador, o hacerlo
en un runner de CI donde eso no sea un problema. Y revisar que `after-pack` y
electron-builder no se pisen el uno al otro con el icono.

---

## 2. Licencia

Hecho: `LICENSE`, en castellano e inglés.

Es una licencia **restrictiva**: se concede usar la aplicación, no
redistribuirla ni publicarla bajo otro nombre. Eso es lo que da derecho a
reclamar si alguien la reetiqueta como suya, que es el riesgo real de una
aplicación de escritorio.

Va en tres sitios, a propósito:

- `LICENSE` en la raíz del repositorio.
- El instalador la enseña y pide aceptarla (`build.nsis.license`).
- Viaja junto a la app instalada (`build.extraResources`), no solo dentro del
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

Comprobar además, con la app **instalada** y no en desarrollo:

- El icono y el nombre en el Administrador de tareas dicen «Atreus», no
  «Electron».
- Ajustes → Catálogo → Abrir carpeta lleva a `%APPDATA%/Atreus/data/games`.
- Desinstalar no borra `%APPDATA%/Atreus`: las definiciones, los mods y los
  perfiles sobreviven.
