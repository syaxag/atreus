import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const fileName = `Atreus-${pkg.version}-setup.exe`;
const installer = join(root, 'release', fileName);
const [binary, fileStat] = await Promise.all([readFile(installer), stat(installer)]);

const sha512 = createHash('sha512').update(binary).digest('base64');
const releaseDate = new Date().toISOString();
const manifest = [
  `version: ${pkg.version}`,
  'files:',
  `  - url: ${fileName}`,
  `    sha512: ${sha512}`,
  `    size: ${fileStat.size}`,
  `path: ${fileName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n');

await writeFile(join(root, 'release', 'latest.yml'), manifest, 'utf8');
console.log(`latest.yml creado para ${fileName}`);
