import { app, BrowserWindow, Menu, Tray, nativeImage, session, shell } from 'electron';
import { join } from 'node:path';
import { ensurePaths, paths } from './paths';
import { log } from './logger';
import { registerIpc } from './ipc/register';
import { registerSchemes, registerProtocolHandlers } from './protocol';
import { getSettings } from './services/settings';
import { scan, rehydrateCovers, listGames, refreshDefinitions } from './services/catalog';
import { watchDefinitions, stopWatching } from './services/catalog/definitions';
import { closeAll as closeSteamSessions } from './services/steam/session';
import { emit } from './ipc/emit';
import { startActivityMonitor, stopActivityMonitor } from './services/catalog/activity';
import { startAutomaticSync, stopAutomaticSync } from './services/catalog/sync';
import { startAutomaticUpdates } from './services/updater';
import { startWarmup, stopWarmup } from './services/platinum/warmup';
import { flush as flushGuides } from './services/guides/store';
import { forgetDiscovery } from './services/mods/providers';

const logger = log('main');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Cerrar la ventana solo oculta; salir de verdad requiere pasar por el tray. */
let quitting = false;

/**
 * El mismo icono se usa para la ventana y la bandeja. En desarrollo vive en
 * el repositorio; al empaquetar electron-builder lo copia a resources.
 */
function appIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(process.cwd(), 'resources', 'icon.ico');
}

// El esquema propio debe declararse antes de que la app esté lista.
registerSchemes();

/**
 * Una sola instancia: si ya hay una corriendo, se enfoca y esta se cierra.
 *
 * Queda registrado. Electron aplaza el cierre hasta después de `ready`, así
 * que sin esta línea la app arranca del todo y desaparece sin explicación —y
 * desde fuera se ve igual que un fallo de arranque.
 */
const tieneCandado = app.requestSingleInstanceLock();

if (!tieneCandado) {
  logger.info('ya hay otra instancia de Atreus abierta; se le cede el paso');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

/**
 * El dominio registrable de una URL: `mapgenie.io` para `cdn.mapgenie.io`.
 *
 * Aproximación deliberada —no consulta la lista pública de sufijos—, así que
 * para un dominio de tercer nivel como `algo.co.uk` se queda en `co.uk`. Vale
 * para lo que hace falta aquí, que es distinguir "esto es del proveedor del
 * mapa" de "esto es de una red de anuncios".
 */
function dominioDe(url: string): string {
  try {
    const partes = new URL(url).hostname.split('.');
    return partes.slice(-2).join('.');
  } catch {
    return '';
  }
}

/**
 * La sesión de los mapas no carga marcos de terceros.
 *
 * Medido abriendo el mapa de un juego en MapGenie: **479 subframes**, casi
 * todos sincronizaciones de identificadores entre redes de anuncios, muchos
 * fallando por DNS o por conexión cerrada. El mapa estaba listo a los 5
 * segundos y la página no callaba hasta los 29, que es lo que se sentía como
 * "el Atlas va lentísimo y se cuelga".
 *
 * Se cortan solo los **marcos** de otro dominio y los `ping`/`beacon`. El mapa
 * se dibuja con lienzo y JavaScript propios, así que no pierde nada; lo que
 * desaparece es lo que nunca fue parte del mapa. Es además coherente con el
 * resto de la aplicación, que no pide cuentas ni contraseñas a nadie.
 */
function blindarSesionDeMapas(ses: Electron.Session): void {
  let cortados = 0;
  ses.webRequest.onBeforeRequest((detalles, callback) => {
    const tipo = detalles.resourceType;
    if (tipo !== 'subFrame' && tipo !== 'ping') return callback({});

    const propio = dominioDe(detalles.url);
    const anfitrion = detalles.frame?.top?.url ? dominioDe(detalles.frame.top.url) : '';
    if (tipo === 'subFrame' && propio !== '' && propio === anfitrion) return callback({});

    cortados++;
    // Un solo recuento por tramos: uno por petición llenaría el registro con
    // cientos de líneas idénticas por cada mapa que se abra.
    if (cortados % 100 === 0) logger.info(`mapas: ${cortados} marcos de terceros cortados`);
    callback({ cancel: true });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false, // La barra de título la dibuja el renderer. Ver docs/DESIGN.md.
    backgroundColor: '#0a0a0d',
    title: 'Atreus',
    icon: appIconPath(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // koffi necesita cargar en el proceso main, no en el renderer.
      /*
       * Los mapas interactivos se abren dentro de la aplicación, en un
       * <webview> aislado. Es un contexto separado del renderer: no ve el
       * puente `window.atreus` ni puede tocar el sistema de archivos.
       */
      webviewTag: true,
      /*
       * La celebración suena sola al conseguir un platino, sin que nadie pulse
       * nada. Chromium exige un gesto antes de reproducir audio; en una
       * aplicación de escritorio esa protección no pinta nada, porque el
       * usuario ya decidió abrirla.
       */
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  // Evita el parpadeo blanco: mostrar solo cuando ya hay algo pintado.
  mainWindow.once('ready-to-show', () => {
    logger.info('ventana lista, mostrando');
    mainWindow?.show();
  });

  // Red de seguridad: si `ready-to-show` no llega, la ventana se queda invisible
  // y la app parece no arrancar. Es mejor enseñarla aunque esté a medias, que
  // así al menos se ve el error en pantalla.
  const showGuard = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      logger.warn('la ventana no avisó de estar lista en 8 s; se muestra igualmente');
      mainWindow.show();
    }
  }, 8000);
  mainWindow.once('show', () => clearTimeout(showGuard));

  mainWindow.webContents.on('did-fail-load', (_e, code, description, url) => {
    logger.error(`no se pudo cargar la interfaz (${code} ${description}): ${url}`);
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logger.error(`el proceso de la interfaz murió: ${details.reason}`);
  });
  mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
    // Los errores de la consola del renderer no llegan al registro del main,
    // y son justo los que hacen falta cuando la ventana sale en blanco.
    if (level >= 2) logger.error(`[renderer] ${message} (${source}:${line})`);
  });

  mainWindow.on('close', (e) => {
    if (!quitting && getSettings().minimizeToTray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Cualquier enlace externo se abre en el navegador, nunca dentro de la app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  /*
   * El <webview> de los mapas se queda con lo mínimo.
   *
   * `webviewTag: true` deja que la etiqueta traiga sus propias preferencias, y
   * quien las escribe es el HTML del renderer: fijarlas aquí es lo que impide
   * que una futura etiqueta —o una inyección en esa página— pida integración
   * con Node o un preload. Se borra el preload, se apaga Node y se aísla el
   * contexto, pase lo que pase en la etiqueta.
   */
  mainWindow.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    // `allowpopups` es un atributo de presencia: se quita, no se pone a false.
    delete params['allowpopups'];
  });

  /*
   * Un mapa es una página web ajena: no tiene por qué pedir el micrófono, la
   * cámara ni la ubicación, y nada de lo que Atreus hace depende de
   * concederlo. Se deniega todo sin preguntar, y queda en el registro.
   *
   * Hay que hacerlo en la partición del <webview>, que es una sesión distinta
   * de la de la ventana: ponerlo solo en la ventana no cubriría los mapas,
   * que son justo lo único que carga páginas de fuera.
   */
  const sesionMapas = session.fromPartition('persist:atreus-maps');
  for (const [nombre, ses] of [
    ['ventana', mainWindow.webContents.session],
    ['mapas', sesionMapas],
  ] as const) {
    ses.setPermissionRequestHandler((_contents, permission, callback) => {
      logger.warn(`permiso denegado en la sesión de ${nombre}: ${permission}`);
      callback(false);
    });
  }

  blindarSesionDeMapas(sesionMapas);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function createTray(): void {
  const icon = nativeImage.createFromPath(appIconPath());
  // Un ICO ausente no debe impedir que la app arranque; sí queda registrado
  // para que se pueda corregir en una instalación mal empaquetada.
  if (icon.isEmpty()) logger.warn(`no se pudo cargar el icono de bandeja: ${appIconPath()}`);
  tray = new Tray(icon);
  tray.setToolTip('Atreus');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Atreus', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { type: 'separator' },
      { label: 'Abrir carpeta de datos', click: () => shell.openPath(paths.root) },
      { label: 'Ver registro', click: () => shell.openPath(paths.logs) },
      { type: 'separator' },
      { label: 'Salir', click: () => { quitting = true; app.quit(); } },
    ]),
  );
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.whenReady().then(() => {
  // El cierre por instancia duplicada llega después de `ready`: no hay nada
  // que arrancar mientras tanto.
  if (!tieneCandado) return;

  ensurePaths();
  logger.info(`Atreus ${app.getVersion()} arrancando — datos en ${paths.root}`);

  registerProtocolHandlers();
  registerIpc();
  // Datos y programa siguen rutas separadas: el contenido se refresca en
  // segundo plano; la actualización de Atreus solo actúa si hay un feed HTTPS.
  startAutomaticSync();
  void startAutomaticUpdates();

  // Las definiciones del usuario se vigilan: dejar un JSON nuevo en
  // %APPDATA%/Atreus/data/games aparece en la app sin reiniciarla.
  watchDefinitions(() => {
    const games = refreshDefinitions();
    // Si cambió el proveedor de mods de un juego, lo cacheado ya no vale.
    forgetDiscovery();
    emit('library:updated', games);
    emit('toast', { level: 'info', message: 'Definiciones recargadas' });
  });
  createWindow();
  createTray();

  if (getSettings().scanOnStart) {
    // El escaneo ya deja el mapa de carátulas puesto; rehidratar además sería
    // recorrer las bibliotecas de Steam dos veces.
    void scan()
      .then((games) => {
        emit('library:updated', games);
        startActivityMonitor();
        startWarmup();
      })
      .catch((e) => logger.error('el escaneo de arranque falló:', e));
  } else {
    // Las rutas de carátula viven en memoria: sin escaneo hay que reconstruirlas.
    rehydrateCovers();
    startActivityMonitor();
    startWarmup();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopWatching();
  stopActivityMonitor();
  stopWarmup();
  // La caché de guías escribe con retardo: si no se vuelca, se pierde lo último.
  flushGuides();
  stopAutomaticSync();
  // Cada sesión abierta es un proceso hijo: hay que cerrarlos o quedan huérfanos.
  closeSteamSessions();
});

// En Windows, cerrar todas las ventanas no debe matar la app si vive en el tray.
app.on('window-all-closed', () => {
  if (!getSettings().minimizeToTray) app.quit();
});

process.on('uncaughtException', (e) => logger.error('excepción no capturada', e));
process.on('unhandledRejection', (e) => logger.error('promesa rechazada sin capturar', e));
