/*
 * Comprueba que el catálogo compartido funciona de punta a punta.
 *
 * Arranca Atreus con la carpeta de definiciones del usuario vacía y mira si se
 * rellena sola desde el catálogo publicado en GitHub. Es la única forma de
 * saberlo: los tests comprueban el manifiesto, pero no que un Atreus real lo
 * encuentre, se lo baje y acepte los hashes.
 */
const { app } = require('electron');
const { readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

require('./out/main/index.js');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const carpeta = join(app.getPath('appData'), 'Atreus-dev', 'data', 'games');
  const antes = existsSync(carpeta) ? readdirSync(carpeta).length : 0;
  console.log(`definiciones del usuario antes: ${antes}`);

  // La sincronización arranca sola al abrir la aplicación.
  await esperar(30000);

  const despues = existsSync(carpeta) ? readdirSync(carpeta) : [];
  console.log(`definiciones del usuario después: ${despues.length}`);
  for (const f of despues.slice(0, 4)) console.log(`  · ${f}`);

  console.log(despues.length > antes
    ? 'RESULTADO: el catálogo compartido funciona'
    : 'RESULTADO: no se trajo nada');
  app.quit();
});
