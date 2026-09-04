# Hoja de ruta: publicar Atreus

Lo que hay que hacer para que Atreus deje de vivir en un disco duro y lo pueda
descargar cualquiera. En orden, y con lo que cada paso desbloquea.

El punto de partida: la aplicación funciona, tiene 355 tests, un CI escrito y un
instalador que se construye solo. Lo único que le falta es **un sitio donde
estar**.

Estado: **todo hecho.**

---

## Las decisiones que se tomaron antes de empezar

No son tareas, son elecciones. Se anotan aquí porque dentro de seis meses nadie
se acuerda de por qué algo está como está.

### Gratis, con donación opcional · decidido

Se valoró venderlo. Se descartó, y por buenos motivos: el Atlas enseña mapas de
MapGenie sin sus anuncios, las Rutas reproducen texto de la comunidad de Steam y
de wikis ajenas, y las pasarelas de pago rechazan software que desbloquea logros.
Cobrar convertía las tres cosas en un problema.

Gratis no las convierte en nada. Se queda gratis, con un enlace de donación que
**no desbloquea nada** —no hay versión de pago ni funciones escondidas— y el
apoyo que de verdad se pide es un seguimiento en TikTok.

### Público, con el Atlas y las Rutas como están · decidido

Al no cobrar, el Atlas se queda integrado y las Rutas siguen enseñando el texto
completo con su atribución. Queda dicho para que conste: el Atlas corta los
marcos de terceros de la página del proveedor, lo cual quita de paso su
publicidad. Es una decisión tomada a sabiendas, no un descuido, y el porqué está
escrito en `src/main/index.ts`. Si algún día un proveedor lo pide, se cambia a
abrir el mapa en el navegador y son veinte líneas.

### La licencia no cambia · decidido

`LICENSE` sigue siendo restrictiva: gratis para usar en los equipos que quieras,
prohibido redistribuir. Publicar el código no es cederlo. Lo que sí implica —y
conviene saberlo— es que los términos de GitHub obligan a permitir ver y
bifurcar cualquier repositorio público.

---

## 1. El nombre · ✅

La carpeta se llamaba `AtreusCheat`. Era el nombre de cuando el proyecto tenía
un motor de cheats, que se retiró en septiembre de 2026 y ya no existe: hoy
Atreus lee logros, calcula platinos y ordena mods. El nombre había dejado de
describir la aplicación y describía su pasado.

Importa más de lo que parece al publicar: es lo primero que se lee, decide cómo
te clasifica quien llega de fuera y aparece en la dirección para siempre.

- Repositorio: **`atreus`**.
- Carpeta local: **`Atreus`**.
- `package.json` y el instalador ya se llamaban Atreus; ahí no había nada que
  cambiar.

## 2. El repositorio, público · ✅

`syaxag/atreus`, con todo el historial. Publicar el código es lo que permite
tener Releases públicas, que es de donde la gente descarga.

Con esto arranca además el CI que ya estaba escrito y no corría por no haber
remoto: lint, tipos y 355 tests en cada empujón, sobre Windows.

## 3. La Release, con el instalable · ✅

`Atreus-0.1.1-setup.exe` publicado como Release `v0.1.1`, con su `latest.yml`
al lado —que es lo que hace posible el paso siguiente— y su `blockmap`, que
permite descargar solo lo que cambia en las actualizaciones.

**Windows va a avisar** de que no reconoce al editor. Tiene razón: firmar cuesta
un certificado de pago que este proyecto no tiene. El README lo dice antes de
que pase, con la alternativa —compilarlo uno mismo— al lado.

## 4. Las actualizaciones automáticas · ✅

`electron-updater` estaba montado desde hacía meses y no tenía a quién
preguntar. Ahora sí: el origen apunta a las Releases del repositorio y Atreus
comprueba solo si hay versión nueva.

Publicar una versión pasa a ser: subir el número en `package.json`,
`npm run dist`, y colgar la Release. Quien la tenga instalada se entera sola.

## 5. Que la página cuente lo que es · ✅

Un repositorio público es un escaparate, no un almacén. El README ya abre por
dónde se descarga y qué esperar; se le añaden los datos que la página de GitHub
usa para presentarlo —descripción y temas— y el botón de patrocinio.

---

## Lo que queda para otro día

No hace falta para publicar, y por eso no está aquí arriba.

- **Firmar el ejecutable.** Requiere un certificado de pago. Está todo preparado
  para el día que exista: dónde se enciende y qué variables lee el builder, en
  `docs/PUBLISHING.md`.
- **Tests de `backups`/`restore` y `protocol.ts`**, que son los bordes que
  quedaron sin red tras la hoja de ruta de calidad. Ver `ROADMAP-CALIDAD.md`.
- **Un catálogo común de definiciones**, que es el punto 6 de `ROADMAP.md` y
  necesitaba exactamente lo mismo que necesitaba esto: un sitio donde publicar.
  Ahora ya lo hay.
