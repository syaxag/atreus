/*
 * La mitad de la prueba de humo que corre **dentro** de Atreus.
 *
 * Arranca la aplicación de verdad —el mismo `out/main/index.js` que se
 * empaqueta— y la conduce: recorre las secciones, cambia de idioma y apunta lo
 * que ve. Devuelve una sola línea de JSON precedida de `SMOKE ` para que
 * `scripts/smoke.mjs` la lea sin tener que interpretar el registro.
 *
 * **Vive en la raíz a propósito.** Electron resuelve `app.getAppPath()` a la
 * carpeta del archivo que se le pasa, y en desarrollo de ahí salen las fichas
 * de fábrica: desde `scripts/` la aplicación arrancaría con cero definiciones,
 * que es una aplicación parecida pero no la misma. Una prueba que no ejercita
 * lo que se publica no sirve de nada.
 */
const { app, BrowserWindow } = require('electron');

require('./out/main/index.js');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Las nueve secciones, por su nombre **interno**.
 *
 * Antes iban por su texto en castellano —'Portada', 'Colección'…— y eso hacía
 * que la prueba dependiera de un ajuste del usuario: con el idioma guardado en
 * inglés no encontraba ni un botón y las nueve salían en rojo, con la
 * aplicación perfectamente sana. Pasó de verdad.
 *
 * Ahora se conduce por `data-seccion`, que es el identificador que la barra
 * lateral ya manejaba por dentro y no cambia con la traducción. De paso, la
 * prueba dice lo que quiere decir: no comprueba que exista un botón llamado
 * "Colección", comprueba que se llega a la colección.
 */
const SECCIONES = [
  ['home', 'Portada'],
  ['library', 'Colección'],
  ['profile', 'Perfil'],
  ['activity', 'Actividad'],
  ['achievements', 'Trofeos'],
  ['guides', 'Rutas'],
  ['maps', 'Atlas'],
  ['mods', 'Taller'],
  ['settings', 'Ajustes'],
];

/**
 * Cuánto se espera al calentamiento.
 *
 * Arranca a los ocho segundos y va de uno en uno; con clave de la Web API cada
 * juego es una petición. No hace falta que termine: basta con que haya
 * guardado algo antes de que la sonda mire si sobrevive al reinicio.
 */
const ESPERA_CALENTAMIENTO_MS = 26_000;

app.whenReady().then(async () => {
  const resultado = {
    ventana: false,
    erroresDeConsola: [],
    secciones: {},
    idioma: { cambia: false, vuelve: false, deInicio: null, restaurado: null },
    excepcion: null,
  };

  try {
    await espera(6000);
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error('la aplicación no abrió ninguna ventana');
    resultado.ventana = true;

    const wc = win.webContents;
    const js = (codigo) => wc.executeJavaScript(codigo, true);
    wc.on('console-message', (_evento, nivel, mensaje) => {
      // 2 = warning, 3 = error. Lo de abajo es ruido de desarrollo.
      if (nivel >= 2) resultado.erroresDeConsola.push(mensaje);
    });

    // Sin esto la captura y el pintado se detienen al perder el foco, y la
    // sonda mediría una ventana congelada.
    win.setAlwaysOnTop(true);
    win.focus();
    wc.setBackgroundThrottling(false);

    const irA = (id) => js(`
      (() => {
        const b = document.querySelector('nav [data-seccion=' + ${JSON.stringify(JSON.stringify(id))} + ']');
        if (b) b.click();
        return !!b;
      })()
    `);

    /** Pulsa un idioma del selector de Ajustes por su identificador. */
    const ponerIdioma = (id) => js(`
      (() => {
        const b = document.querySelector('[data-idioma=' + ${JSON.stringify(JSON.stringify(id))} + ']');
        if (b) b.click();
        return !!b;
      })()
    `);

    /**
     * Qué idioma hay puesto, leído del puente y no de la pantalla.
     *
     * Es una lectura, así que no cambia nada, y dice la verdad sin tener que
     * adivinar qué botón se ve como activo.
     */
    const idiomaActual = () => js(
      'window.atreus.settings.get().then((r) => (r.ok ? r.data.language : null))',
    );

    const contenido = () => js(`
      (() => {
        const m = document.querySelector('main');
        const h = m ? m.querySelector('h1') : null;
        return {
          cabecera: h ? h.textContent.trim() : null,
          caracteres: m ? m.innerText.trim().length : 0,
        };
      })()
    `);

    /*
     * Con qué idioma se encontró la aplicación.
     *
     * Se apunta para devolverlo al final: la prueba de humo no debe dejar los
     * ajustes de quien la ejecuta distintos de como estaban. Antes los dejaba
     * en castellano pasara lo que pasara, y una sonda que había puesto inglés
     * a mano hizo fallar la ejecución siguiente entera.
     */
    resultado.idioma.deInicio = await idiomaActual();

    // ── Las nueve secciones ──
    for (const [id, nombre] of SECCIONES) {
      const llega = await irA(id);
      await espera(1800);
      resultado.secciones[nombre] = { llega, ...(await contenido()) };
    }

    /*
     * ── El idioma cambia la interfaz, y vuelve ──
     *
     * Se comprueba mirando **la propia barra lateral**, no el ajuste guardado:
     * lo que importa no es que el valor cambie en el disco sino que la pantalla
     * se repinte traducida sin reiniciar. Por eso sigue habiendo un texto en
     * esta comprobación, y solo aquí.
     */
    await irA('settings');
    await espera(1200);

    // Se parte de un idioma conocido, valga el que valga el guardado.
    await ponerIdioma('es');
    await espera(1200);

    await ponerIdioma('en');
    await espera(1500);
    resultado.idioma.cambia = await js(`
      [...document.querySelectorAll('nav button')].some((b) => b.textContent.trim().startsWith('Collection'))
    `);

    await ponerIdioma('es');
    await espera(1500);
    resultado.idioma.vuelve = await js(`
      [...document.querySelectorAll('nav button')].some((b) => b.textContent.trim().startsWith('Colección'))
    `);

    // Y se deja como estaba. Se pulsa el botón, no se escribe el ajuste: por
    // el IPC el store del renderer no se entera y la pantalla se quedaría
    // diciendo otra cosa que el disco.
    if (resultado.idioma.deInicio && resultado.idioma.deInicio !== 'es') {
      await ponerIdioma(resultado.idioma.deInicio);
      await espera(1200);
    }
    resultado.idioma.restaurado = await idiomaActual();

    // Se le da tiempo al cálculo en segundo plano para que guarde algo: el
    // segundo arranque comprobará que sigue ahí.
    await espera(ESPERA_CALENTAMIENTO_MS);
  } catch (e) {
    resultado.excepcion = e instanceof Error ? e.message : String(e);
  }

  console.log(`SMOKE ${JSON.stringify(resultado)}`);
  app.quit();
});
