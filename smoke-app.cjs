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
 * Las nueve secciones, por su nombre en castellano.
 *
 * Se recorren en un solo idioma a propósito: recorrerlas en los tres triplica
 * lo que tarda y no comprueba nada nuevo, porque que la traducción llega a la
 * pantalla ya lo dice el cambio de idioma de más abajo.
 */
const SECCIONES = ['Portada', 'Colección', 'Perfil', 'Actividad', 'Trofeos', 'Rutas', 'Atlas', 'Taller', 'Ajustes'];

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
    idioma: { cambia: false, vuelve: false },
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

    const irA = (nombre) => js(`
      (() => {
        const b = [...document.querySelectorAll('nav button')]
          .find((x) => x.textContent.trim().startsWith(${JSON.stringify(nombre)}));
        if (b) b.click();
        return !!b;
      })()
    `);

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

    // ── Las nueve secciones, en castellano ──
    for (const seccion of SECCIONES) {
      const llega = await irA(seccion);
      await espera(1800);
      resultado.secciones[seccion] = { llega, ...(await contenido()) };
    }

    // ── El idioma cambia la interfaz, y vuelve ──
    await irA('Ajustes');
    await espera(1200);
    const pulsar = (etiqueta) => js(`
      (() => {
        const b = [...document.querySelectorAll('button')]
          .find((x) => x.textContent.trim() === ${JSON.stringify(etiqueta)});
        if (b) b.click();
        return !!b;
      })()
    `);
    await pulsar('English');
    await espera(1500);
    resultado.idioma.cambia = await js(`
      [...document.querySelectorAll('nav button')].some((b) => b.textContent.trim().startsWith('Collection'))
    `);
    await pulsar('Español');
    await espera(1500);
    resultado.idioma.vuelve = await js(`
      [...document.querySelectorAll('nav button')].some((b) => b.textContent.trim().startsWith('Colección'))
    `);

    // Se le da tiempo al cálculo en segundo plano para que guarde algo: el
    // segundo arranque comprobará que sigue ahí.
    await espera(ESPERA_CALENTAMIENTO_MS);
  } catch (e) {
    resultado.excepcion = e instanceof Error ? e.message : String(e);
  }

  console.log(`SMOKE ${JSON.stringify(resultado)}`);
  app.quit();
});
