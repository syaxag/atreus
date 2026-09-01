import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseVdf, dig, str, num } from '../src/main/services/catalog/vdf.ts';

const Q = String.fromCharCode(34); // comilla doble, sin escapes en el literal
const SEP = String.fromCharCode(92); // barra invertida

describe('parseVdf', () => {
  test('lee un objeto anidado', () => {
    const root = parseVdf(`
      ${Q}libraryfolders${Q}
      {
        ${Q}0${Q}
        {
          ${Q}path${Q}  ${Q}C:${SEP}${SEP}Steam${Q}
          ${Q}apps${Q}
          {
            ${Q}2379780${Q}  ${Q}66662933${Q}
          }
        }
      }
    `);
    assert.equal(str(root, 'libraryfolders', '0', 'path'), `C:${SEP}Steam`);
    assert.equal(str(root, 'libraryfolders', '0', 'apps', '2379780'), '66662933');
  });

  test('ignora los comentarios de línea', () => {
    const root = parseVdf(`
      ${Q}a${Q}
      {
        // esto es un comentario
        ${Q}b${Q} ${Q}1${Q}
      }
    `);
    assert.equal(str(root, 'a', 'b'), '1');
  });

  test('admite tokens sin comillas, que Steam a veces emite', () => {
    const root = parseVdf(`${Q}a${Q} { b 2 }`);
    assert.equal(str(root, 'a', 'b'), '2');
  });

  test('resuelve los escapes dentro de las cadenas', () => {
    const root = parseVdf(`${Q}a${Q} { ${Q}k${Q} ${Q}x${SEP}${SEP}y${Q} }`);
    assert.equal(str(root, 'a', 'k'), `x${SEP}y`);
  });

  test('falla si falta la llave de apertura', () => {
    assert.throws(() => parseVdf(`${Q}a${Q} ${Q}b${Q}`), /se esperaba/);
  });
});

describe('dig / str / num', () => {
  const root = parseVdf(`${Q}r${Q} { ${Q}n${Q} ${Q}42${Q} ${Q}t${Q} ${Q}hola${Q} ${Q}o${Q} { } }`);

  test('str devuelve undefined si la clave no existe', () => {
    assert.equal(str(root, 'r', 'nope'), undefined);
  });

  test('str devuelve undefined si el valor es un objeto', () => {
    assert.equal(str(root, 'r', 'o'), undefined);
  });

  test('num convierte, y da null si no es numérico', () => {
    assert.equal(num(root, 'r', 'n'), 42);
    assert.equal(num(root, 'r', 't'), null);
    assert.equal(num(root, 'r', 'nope'), null);
  });

  test('dig se corta en cuanto falta un nivel', () => {
    assert.equal(dig(root, 'r', 'nope', 'mas'), undefined);
  });
});
