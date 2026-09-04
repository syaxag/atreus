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

export const net = {
  /**
   * La red, apagada; el disco, no.
   *
   * Un `file://` sí se sirve: es lo que hace el protocolo `atreus://` para
   * entregarle una carátula al renderer, y sin esto no se podría comprobar que
   * entrega **la que toca**. Cualquier otra cosa falla diciendo lo que intentó
   * pedir, en vez de salir de verdad a internet y tardar treinta segundos.
   */
  fetch: async (url: string | URL): Promise<Response> => {
    const texto = String(url);
    if (texto.startsWith('file:')) {
      const { readFileSync } = await import('node:fs');
      const { fileURLToPath } = await import('node:url');
      return new Response(readFileSync(fileURLToPath(texto)));
    }
    throw new Error(`Un test intentó salir a la red: ${texto}`);
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

/**
 * El registro de esquemas propios, con memoria.
 *
 * `protocol.handle()` se queda con la función que le pasa la aplicación, para
 * que un test pueda pedirle un `atreus://…` y ver qué contesta. Sin esto, el
 * protocolo era código imposible de ejercitar: registra un manejador al
 * arrancar y nadie fuera de Chromium puede llamarlo.
 *
 * Es el mismo criterio que el resto del doble: no se inventa comportamiento,
 * se guarda lo que la aplicación entrega para poder mirarlo.
 */
const manejadores = new Map<string, (peticion: Request) => Promise<Response> | Response>();

export const protocol = {
  registerSchemesAsPrivileged: () => undefined,
  handle: (esquema: string, fn: (peticion: Request) => Promise<Response> | Response) => {
    manejadores.set(esquema, fn);
  },
};

/** Lo que contestaría Atreus a esa dirección. Solo para los tests. */
export function pedirA(url: string): Promise<Response> | Response {
  const esquema = url.slice(0, url.indexOf(':'));
  const fn = manejadores.get(esquema);
  if (!fn) throw new Error(`Nadie registró el esquema "${esquema}"`);
  return fn(new Request(url));
}

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
