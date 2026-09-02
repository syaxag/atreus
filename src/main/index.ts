import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron';
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

// Una sola instancia: si ya hay una corriendo, se enfoca y esta se cierra.
if (!app.requestSingleInstanceLock()) {
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
