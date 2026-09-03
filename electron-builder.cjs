/**
 * Empaquetado de Atreus.
 *
 * Vivía en `package.json`, y se ha mudado aquí porque tiene una decisión que
 * tomar: **si hay certificado, se firma; si no, no**. Eso no se puede escribir
 * en un JSON, y dejarlo como un interruptor que hay que acordarse de mover el
 * día que exista el certificado es una trampa puesta a propósito.
 *
 * Ver docs/PUBLISHING.md.
 */

/**
 * ¿Hay con qué firmar?
 *
 * electron-builder lee el certificado de estas variables. `CSC_LINK` es la
 * genérica y `WIN_CSC_LINK` la de Windows; con cualquiera de las dos hay
 * certificado, y sin ninguna no hay nada que firmar por mucho que se le pida.
 */
const firmando = Boolean(process.env.CSC_LINK || process.env.WIN_CSC_LINK);

module.exports = {
  appId: 'us.syax.atreus',
  productName: 'Atreus',
  afterPack: 'scripts/after-pack.cjs',
  directories: {
    output: 'release',
    buildResources: 'resources',
  },
  files: ['out/**/*'],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'resources/icon.ico',
    /*
     * Este interruptor hace dos cosas a la vez, y por eso estaba apagado.
     *
     * Con él activo, electron-builder firma **y** pone el icono y los datos de
     * versión del ejecutable. Lo segundo necesita su paquete `winCodeSign`, que
     * trae enlaces simbólicos de macOS: crear uno en Windows exige modo
     * desarrollador o permisos de administrador, y sin eso la descompresión
     * falla, el paso se salta en silencio y el ejecutable se queda con el icono
     * y el nombre de Electron. Eso es lo que se veía en el instalador.
     *
     * Sin certificado no aporta nada y sí quita, así que se enciende solo
     * cuando hay uno. Del icono se encarga mientras tanto `after-pack.cjs` con
     * `rcedit`, que no necesita ningún privilegio.
     */
    signAndEditExecutable: firmando,
  },
  nsis: {
    license: 'LICENSE',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Atreus',
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    deleteAppDataOnUninstall: false,
  },
  extraResources: [
    { from: 'data', to: 'data' },
    { from: 'resources/icon.ico', to: 'icon.ico' },
    { from: 'LICENSE', to: 'LICENSE' },
  ],
  asarUnpack: [
    '**/node_modules/koffi/**',
    '**/node_modules/7zip-bin/**',
  ],
  artifactName: '${productName}-${version}-setup.${ext}',
  compression: 'maximum',
};
