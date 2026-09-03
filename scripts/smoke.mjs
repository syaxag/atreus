/*
 * Prueba de humo: abrir Atreus y comprobar que hace lo que dice.
 *
 * Existe porque **ni el typecheck ni los tests ven lo que se rompió de
 * verdad**. Los 153 tests son de funciones puras y no tocan disco; la sesión
 * en que se escribió esto encontró, abriendo la aplicación a mano, que la
 * caché de resúmenes vivía en la carpeta que Chromium limpia y desaparecía en
 * **cada arranque**. No daba error, no salía en el registro, y compilaba
 * perfectamente. Lo único que lo delataba era mirar dos veces seguidas.
 *
 * Por eso arranca la aplicación **dos veces**: la mitad de lo que comprueba
 * solo se puede ver en el segundo arranque.
 *
 * Uso:
 *   npm run smoke          (requiere `npm run build` antes, o usa lo que haya)
 *
 * Sale con código 1 si algo falla, para que valga en un runner.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const raiz = process.cwd();
const electron = join(raiz, 'node_modules', 'electron', 'dist', 'electron.exe');
const sonda = join(raiz, 'smoke-app.cjs');

/** Dónde guarda sus datos la aplicación en desarrollo. */
const datos = join(process.env.APPDATA ?? '', 'Atreus-dev');
const resumenes = join(datos, 'platinum.json');

/**
 * Archivos que Atreus se escribe a sí mismo y tienen que seguir ahí mañana.
 *
 * **No se dice dónde están a propósito: se buscan.** La primera versión de
 * esta prueba dejaba un testigo en `cache-atreus/` nombrando la carpeta, y
 * daba verde con el fallo puesto: comprobaba la constante, no el
 * comportamiento. Así, si alguien devuelve la caché a la carpeta que Chromium
 * limpia, estos archivos desaparecen solos y aquí se ve.
 */
const PERSISTENTES = ['guides.json', 'mapgenie.json', 'steam-appids.json'];

/**
 * ¿Es esta la carpeta donde Chromium guarda su caché de disco?
 *
 * Se reconoce por lo que hay dentro, no por el nombre: `Cache_Data` lo crea
 * Chromium y solo aparece donde manda él. Es la comprobación que de verdad
 * sujeta el fallo, porque **el borrado no es determinista**: Chromium limpia
 * los archivos sueltos que no reconoce cuando le toca, no en cada arranque.
 * Reiniciar dos veces puede dar verde con el fallo puesto —pasó al escribir
 * esta prueba—, así que lo que se comprueba es la disposición, que no depende
 * de cuándo le apetezca limpiar.
 */
function esCarpetaDeChromium(dir) {
  try {
    return readdirSync(dir).includes('Cache_Data');
  } catch {
    return false;
  }
}

/**
 * Busca esos archivos por el árbol de datos, sin suponer la carpeta.
 *
 * Devuelve **todas** las copias, no una por nombre: con el fallo puesto quedan
 * dos —la vieja en su sitio y la nueva en el de Chromium— y quedarse con una
 * sola hacía que la prueba mirase justo la que estaba bien.
 */
function buscarPersistentes() {
  const encontrados = [];
  const recorrer = (dir, profundidad) => {
    if (profundidad > 2) return;
    let entradas;
    try {
      entradas = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entrada of entradas) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta, profundidad + 1);
      else if (PERSISTENTES.includes(entrada.name)) encontrados.push({ nombre: entrada.name, ruta });
    }
  };
  recorrer(datos, 0);
  return encontrados;
}

/** Un arranque entero tarda poco más de un minuto entre esperas. */
const LIMITE_MS = 150_000;

const fallos = [];
const notas = [];

function comprobar(condicion, queDeberia, detalle = '') {
  if (condicion) notas.push(`  ok   ${queDeberia}`);
  else fallos.push(`  FALLA ${queDeberia}${detalle ? ` — ${detalle}` : ''}`);
}

/** Arranca Atreus con la sonda dentro y devuelve lo que apuntó. */
function arrancar(etiqueta) {
  return new Promise((resolve) => {
    const hijo = spawn(electron, [sonda], { cwd: raiz });
    let salida = '';
    const matar = setTimeout(() => hijo.kill(), LIMITE_MS);

    hijo.stdout.on('data', (d) => { salida += d.toString(); });
    hijo.stderr.on('data', (d) => { salida += d.toString(); });
    hijo.on('close', () => {
      clearTimeout(matar);
      const linea = salida.split('\n').find((l) => l.startsWith('SMOKE '));
      if (!linea) {
        resolve({ error: `${etiqueta}: la sonda no devolvió nada`, salida });
        return;
      }
      resolve(JSON.parse(linea.slice('SMOKE '.length)));
    });
  });
}

if (!existsSync(electron)) {
  console.error('No está Electron en node_modules. Ejecuta `npm install`.');
  process.exit(1);
}
if (!existsSync(join(raiz, 'out', 'main', 'index.js'))) {
  console.error('No hay nada construido en out/. Ejecuta `npm run build` primero.');
  process.exit(1);
}

console.log('· Primer arranque…');
const uno = await arrancar('primero');

comprobar(!uno.error, 'la aplicación arranca y la sonda contesta', uno.error);
if (uno.error) {
  console.log(uno.salida?.split('\n').slice(-12).join('\n') ?? '');
  console.log(fallos.join('\n'));
  process.exit(1);
}

comprobar(uno.ventana, 'abre una ventana');
comprobar(!uno.excepcion, 'el recorrido termina sin excepciones', uno.excepcion ?? '');
comprobar(
  uno.erroresDeConsola.length === 0,
  'el renderer no escupe errores ni avisos',
  uno.erroresDeConsola.slice(0, 3).join(' | '),
);

/*
 * Que la sección pinte algo, no que pinte un `<h1>`.
 *
 * La primera versión exigía cabecera y el Atlas la suspendió con razón: cuando
 * el juego tiene un solo mapa lo abre directamente, y el visor no lleva
 * cabecera de vista sino barra de navegación. La aplicación estaba bien; la
 * afirmación era mía. Se comprueba lo que vale para las nueve: que quede algo
 * escrito y no un hueco.
 */
const MINIMO_CARACTERES = 40;

for (const [seccion, estado] of Object.entries(uno.secciones)) {
  comprobar(estado.llega, `la barra lateral lleva a ${seccion}`);
  comprobar(
    estado.caracteres >= MINIMO_CARACTERES,
    `${seccion} pinta contenido`,
    `caracteres=${estado.caracteres}`,
  );
}

comprobar(uno.idioma.cambia, 'cambiar a English traduce la barra lateral');
comprobar(uno.idioma.vuelve, 'volver a Español la deja como estaba');

// ── Lo que solo se ve arrancando dos veces ──

comprobar(existsSync(resumenes), 'el primer arranque deja resúmenes guardados');
const antes = existsSync(resumenes)
  ? Object.keys(JSON.parse(readFileSync(resumenes, 'utf8'))).length
  : 0;
const guardadosAntes = buscarPersistentes();

console.log('· Segundo arranque, para ver qué sobrevive…');
const dos = await arrancar('segundo');
comprobar(!dos.error, 'la aplicación vuelve a arrancar', dos.error);

const despues = existsSync(resumenes)
  ? Object.keys(JSON.parse(readFileSync(resumenes, 'utf8'))).length
  : 0;
comprobar(
  despues >= antes && antes > 0,
  'los resúmenes sobreviven al reinicio',
  `antes=${antes} después=${despues}`,
);

comprobar(
  guardadosAntes.length > 0,
  'el primer arranque deja algún archivo de caché escrito',
  PERSISTENTES.join(', '),
);
for (const { nombre, ruta } of guardadosAntes) {
  comprobar(existsSync(ruta), `${nombre} sobrevive al reinicio`, ruta);
  comprobar(
    !esCarpetaDeChromium(dirname(ruta)),
    `${nombre} no está en la carpeta de caché de Chromium`,
    dirname(ruta),
  );
}

console.log('');
console.log(notas.join('\n'));
if (fallos.length > 0) {
  console.log('');
  console.log(fallos.join('\n'));
  console.log(`\n${fallos.length} comprobación(es) fallida(s).`);
  process.exit(1);
}
console.log(`\n${notas.length} comprobaciones, todas en verde.`);
