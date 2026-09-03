import { register } from 'node:module';

/**
 * Deja que los tests importen módulos de `src/` tal como están escritos.
 *
 * El código del proyecto importa a sus vecinos sin extensión —`'./format'`,
 * `'./es'`—, que es lo normal en TypeScript y lo que resuelven Vite y el
 * compilador. Node, en cambio, exige la extensión, así que un test que importe
 * cualquier módulo con importaciones **de valor** se estrella antes de empezar.
 *
 * La alternativa era escribir `'./format.ts'` en el código de la aplicación
 * para contentar al runner. Eso es al revés: el que se adapta es el arnés de
 * pruebas, no lo que se publica.
 */
register('./resolver-ts.mjs', import.meta.url);
