import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Un Electron de mentira, para poder probar el proceso principal.
 *
 * Media aplicación vive detrás de `import { app } from 'electron'`, y en un
 * runner de Node ese módulo no existe. Eso dejaba sin tests **justo lo que más
 * puede romper**: `deploy.ts`, que escribe con enlaces duros dentro de la
 * carpeta de un juego, y `purge()`, que borra y restaura ahí.
 *
 * La regla que el proyecto ya tenía escrita en `test/resolver.mjs` es que **el
 * que se adapta es el arnés, no lo que se publica**. Así que en vez de mover el
 * código de la aplicación para esquivar Electron, el arnés da un Electron.
 *
 * Solo lleva lo que los tests tocan. Lo que no está, no está por descuido:
 * añadir un doble de algo que nadie usa es inventarse un comportamiento que
 * luego nadie comprueba.
 */

/** Cada ejecución escribe en su propia carpeta, y no en los datos de nadie. */
const raizDePruebas = process.env['ATREUS_TEST_DATA']
  ?? mkdtempSync(join(tmpdir(), 'atreus-test-'));

const rutas: Record<string, string> = {
  appData: raizDePruebas,
  userData: join(raizDePruebas, 'userData'),
  temp: tmpdir(),
  home: raizDePruebas,
};

export const app = {
  isPackaged: false,
  getPath: (nombre: string) => rutas[nombre] ?? join(raizDePruebas, nombre),
  setPath: (nombre: string, valor: string) => { rutas[nombre] = valor; },
  getAppPath: () => process.cwd(),
  getVersion: () => '0.0.0-test',
  whenReady: () => Promise.resolve(),
  on: () => undefined,
  quit: () => undefined,
  requestSingleInstanceLock: () => true,
};

/**
 * La red, apagada por defecto.
 *
 * Un test que llegue aquí sin querer falla diciendo lo que intentó pedir, en
 * vez de salir de verdad a internet y tardar treinta segundos en decir nada.
 * Para probar una respuesta concreta se pone `net.fetch` a mano.
 */
export const net = {
  fetch: async (url: string | URL): Promise<Response> => {
    throw new Error(`Un test intentó salir a la red: ${String(url)}`);
  },
};

export const safeStorage = {
  /**
   * Apagado por defecto, que es el caso que más importa comprobar: sin cifrado
   * disponible, una clave guardada no se puede perder.
   */
  isEncryptionAvailable: () => false,
  encryptString: (texto: string) => Buffer.from(texto, 'utf8'),
  decryptString: (buffer: Buffer) => buffer.toString('utf8'),
};

export const shell = {
  openPath: async () => '',
  openExternal: async () => undefined,
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] as string[] }),
};

export const ipcMain = {
  handle: () => undefined,
  on: () => undefined,
};

export const protocol = {
  registerSchemesAsPrivileged: () => undefined,
  handle: () => undefined,
};

export const BrowserWindow = class {
  static getAllWindows() { return []; }
  static fromWebContents() { return null; }
};

export const session = {
  fromPartition: () => ({
    setPermissionRequestHandler: () => undefined,
    webRequest: { onBeforeRequest: () => undefined },
  }),
};

export const Menu = { buildFromTemplate: () => ({}) };
export const Tray = class { setToolTip() {} setContextMenu() {} on() {} };
export const nativeImage = { createFromPath: () => ({ isEmpty: () => true }) };

export default {
  app, net, safeStorage, shell, dialog, ipcMain, protocol,
  BrowserWindow, session, Menu, Tray, nativeImage,
};
