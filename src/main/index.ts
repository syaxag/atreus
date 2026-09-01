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
import { detachAll as detachTrainers } from './services/trainer';
import { detachAll as detachScanners } from './services/trainer/scan-session';
import { emit } from './ipc/emit';

const logger = log('main');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Cerrar la ventana solo oculta; salir de verdad requiere pasar por el tray. */
let quitting = false;

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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // koffi necesita cargar en el preload/main, no en el renderer.
    },
  });

  // Evita el parpadeo blanco: mostrar solo cuando ya hay algo pintado.
  mainWindow.once('ready-to-show', () => mainWindow?.show());

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
  // El icono real llega en la FASE 6; de momento uno vacío para no romper el arranque.
  const icon = nativeImage.createEmpty();
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

  // Las definiciones del usuario se vigilan: dejar un JSON nuevo en
  // %APPDATA%/Atreus/data/games aparece en la app sin reiniciarla.
  watchDefinitions(() => {
    const games = refreshDefinitions();
    emit('library:updated', games);
    emit('toast', { level: 'info', message: 'Definiciones recargadas' });
  });
  createWindow();
  createTray();

  if (getSettings().scanOnStart) {
    // El escaneo ya deja el mapa de carátulas puesto; rehidratar además sería
    // recorrer las bibliotecas de Steam dos veces.
    void scan()
      .then((games) => emit('library:updated', games))
      .catch((e) => logger.error('el escaneo de arranque falló:', e));
  } else {
    // Las rutas de carátula viven en memoria: sin escaneo hay que reconstruirlas.
    rehydrateCovers();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  stopWatching();
  // Cada sesión abierta es un proceso hijo: hay que cerrarlos o quedan huérfanos.
  closeSteamSessions();
  // Y soltar los procesos enganchados, restaurando los parches que sigan puestos.
  detachTrainers();
  detachScanners();
});

// En Windows, cerrar todas las ventanas no debe matar la app si vive en el tray.
app.on('window-all-closed', () => {
  if (!getSettings().minimizeToTray) app.quit();
});

process.on('uncaughtException', (e) => logger.error('excepción no capturada', e));
process.on('unhandledRejection', (e) => logger.error('promesa rechazada sin capturar', e));
