/**
 * Pone el icono y los datos de versión en `Atreus.exe`.
 *
 * electron-builder sabe hacerlo con `signAndEditExecutable`, pero en esta
 * máquina no puede: para ello descarga y descomprime su paquete `winCodeSign`,
 * que contiene enlaces simbólicos de macOS, y crear un enlace simbólico en
 * Windows exige el modo desarrollador o permisos de administrador. La
 * descompresión falla, el paso se salta, y el ejecutable se queda con el icono
 * y el nombre de Electron — que es justo lo que se veía en el instalador.
 *
 * Aquí se hace lo mismo con `rcedit`, que es una dependencia normal del
 * proyecto y no necesita ningún privilegio. Se ejecuta después de empaquetar la
 * aplicación y **antes** de construir el instalador, así que el NSIS recoge el
 * ejecutable ya marcado.
 */
const { join } = require('node:path');
const { existsSync } = require('node:fs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { productFilename, version } = context.packager.appInfo;
  const exe = join(context.appOutDir, `${productFilename}.exe`);
  const icon = join(context.packager.projectDir, 'resources', 'icon.ico');

  if (!existsSync(exe)) throw new Error(`no se encontró el ejecutable empaquetado: ${exe}`);
  if (!existsSync(icon)) throw new Error(`falta resources/icon.ico — ejecuta "npm run icon"`);

  // rcedit 5 es un módulo ESM con exportación nombrada; desde CommonJS llega
  // como espacio de nombres, no como función suelta.
  const { rcedit } = require('rcedit');
  await rcedit(exe, {
    icon,
    'file-version': version,
    'product-version': version,
    'version-string': {
      CompanyName: 'Syax',
      ProductName: 'Atreus',
      FileDescription: 'Atreus',
      // Sin esto, el Administrador de tareas y las propiedades del archivo
      // siguen diciendo "Electron", que es lo que delata que la app no es tuya.
      InternalName: 'Atreus',
      OriginalFilename: `${productFilename}.exe`,
      LegalCopyright: `© ${new Date().getFullYear()} Syax`,
    },
  });

  console.log(`  • icono y versión aplicados al ejecutable  file=${exe}`);
};
