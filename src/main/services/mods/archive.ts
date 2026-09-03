import { createWriteStream, mkdirSync, existsSync, readdirSync, statSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { log } from '../../logger';

const logger = log('mods:archive');

/**
 * Extracción de archivos de mod.
 *
 * `.zip` con yauzl, que es una dependencia declarada. `.7z` y `.rar` con el
 * binario `7za` que ya viene con electron-builder.
 */

/**
 * Rechaza rutas que se salgan del destino.
 *
 * Un `.zip` puede traer entradas como `../../windows/system32/x`; sin esta
 * comprobación, extraer un archivo descargado escribiría fuera de la carpeta
 * de destino. Es el clásico "zip slip".
 */
function safeJoin(root: string, entry: string): string | null {
  const clean = normalize(entry).replace(/^([/\\])+/, '');
  if (clean.split(/[/\\]/).includes('..')) return null;
  const full = join(root, clean);
  if (!full.startsWith(root + sep) && full !== root) return null;
  return full;
}

async function extractZip(archivePath: string, destination: string): Promise<number> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, file) => {
      if (err || !file) reject(err ?? new Error('zip ilegible'));
      else resolve(file);
    });
  });

  let count = 0;
  let skipped = 0;

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      const target = safeJoin(destination, entry.fileName);
      if (!target) {
        skipped++;
        zip.readEntry();
        return;
      }

      // Las carpetas del zip terminan en '/'
      if (entry.fileName.endsWith('/')) {
        mkdirSync(target, { recursive: true });
        zip.readEntry();
        return;
      }

      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) { reject(err ?? new Error('entrada ilegible')); return; }
        mkdirSync(dirname(target), { recursive: true });
        pipeline(stream, createWriteStream(target))
          .then(() => { count++; zip.readEntry(); })
          .catch(reject);
      });
    });
    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });

  if (skipped > 0) {
    logger.warn(`${skipped} entradas descartadas por salirse del destino en ${archivePath}`);
  }
  return count;
}

function extractWith7za(archivePath: string, destination: string): number {
  // 7zip-bin viene con electron-builder; se resuelve en tiempo de ejecución
  // para que un fallo aquí sea "formato no soportado" y no un crash al arrancar.
  const { path7za } = require('7zip-bin') as { path7za: string };
  if (!existsSync(path7za)) throw new Error('No se encontró 7za para extraer este formato');

  mkdirSync(destination, { recursive: true });
  execFileSync(path7za, ['x', archivePath, `-o${destination}`, '-y', '-bso0', '-bsp0'], {
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return countFiles(destination);
}

function countFiles(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countFiles(join(dir, entry.name));
    else total++;
  }
  return total;
}

/**
 * Formatos que Atreus sabe extraer de verdad.
 *
 * `.rar` estuvo aquí y era mentira: el `7za.exe` que trae 7zip-bin es la
 * versión reducida, sin el códec Rar —`7za i` solo lista 7z, cab, bzip2,
 * gzip, lzma, tar, xz y zip—, así que la extracción fallaba con un error
 * crudo del binario después de haberlo ofrecido en el selector.
 */
export const SUPPORTED = ['.zip', '.7z'];

/**
 * Un `.rar` llega de vez en cuando porque medio internet publica mods así.
 * Decir qué hacer vale más que repetir la lista de lo admitido.
 */
export const RAR = 'Atreus no puede abrir un .rar: el extractor que lleva no incluye '
  + 'ese formato. Descomprímelo y vuelve a empaquetarlo como .zip o .7z.';

/**
 * Lee un JSON de dentro de un zip sin extraerlo.
 *
 * Los mods empaquetados (`.geode`) son zips que llevan su manifiesto dentro.
 * Como se despliegan tal cual, sin extraer, esta es la única forma de sacarles
 * el nombre y la versión de verdad en vez de deducirlos del nombre del archivo.
 */
export async function readJsonFromZip(
  archivePath: string,
  candidates: string[],
): Promise<Record<string, unknown> | null> {
  const wanted = new Set(candidates.map((c) => c.toLowerCase()));

  const zip = await new Promise<yauzl.ZipFile | null>((resolve) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, file) => {
      resolve(err || !file ? null : file);
    });
  });
  if (!zip) return null;

  return new Promise((resolve) => {
    let done = false;
    const finish = (value: Record<string, unknown> | null) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    zip.on('entry', (entry: yauzl.Entry) => {
      if (!wanted.has(entry.fileName.toLowerCase())) { zip.readEntry(); return; }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) { zip.readEntry(); return; }
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => {
          try {
            finish(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
          } catch {
            finish(null);
          }
          zip.close();
        });
        stream.on('error', () => { zip.readEntry(); });
      });
    });
    zip.on('end', () => finish(null));
    zip.on('error', () => finish(null));
    zip.readEntry();
  });
}

/** Extrae el archivo a `destination`. Devuelve cuántos archivos escribió. */
export async function extract(archivePath: string, destination: string): Promise<number> {
  const lower = archivePath.toLowerCase();
  mkdirSync(destination, { recursive: true });

  if (lower.endsWith('.zip')) return extractZip(archivePath, destination);
  if (lower.endsWith('.7z')) return extractWith7za(archivePath, destination);
  if (lower.endsWith('.rar')) throw new Error(RAR);
  throw new Error(`Formato no soportado. Se admiten: ${SUPPORTED.join(', ')}`);
}

/**
 * Aplana una envoltura sobrante.
 *
 * Casi todos los mods vienen dentro de una única carpeta que repite el nombre
 * del archivo. Si tras extraer solo hay una carpeta en la raíz, se sube su
 * contenido un nivel para que el orden de despliegue sea predecible.
 */
export function flattenSingleRoot(destination: string): void {
  const entries = readdirSync(destination, { withFileTypes: true });
  if (entries.length !== 1 || !entries[0]!.isDirectory()) return;

  const inner = join(destination, entries[0]!.name);
  const innerEntries = readdirSync(inner);

  // Si la carpeta interior contiene a su vez una sola carpeta con el mismo
  // nombre, no se toca: puede ser la estructura real que espera el juego.
  for (const name of innerEntries) {
    const from = join(inner, name);
    const to = join(destination, name);
    if (existsSync(to)) return; // colisión: mejor no tocar nada
    renameSync(from, to);
  }
  rmSync(inner, { recursive: true, force: true });
}

/** Lista recursiva de archivos, con rutas relativas a `root`. */
export function listFiles(root: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, relative));
    else out.push(relative);
  }
  return out;
}

/** Tamaño total de un árbol, en bytes. */
export function treeSize(root: string): number {
  return listFiles(root).reduce((total, relative) => {
    try {
      return total + statSync(join(root, relative)).size;
    } catch {
      return total;
    }
  }, 0);
}
