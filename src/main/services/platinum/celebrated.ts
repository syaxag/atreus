import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GameId } from '@shared/types';
import { paths } from '../../paths';
import { log } from '../../logger';
import { decidirCelebracion } from './regla-celebracion';

const logger = log('platinum:celebrado');

/**
 * Qué platinos ya se han celebrado.
 *
 * Existe por una razón concreta: la celebración tiene que saltar cuando
 * **acabas** de conseguir un platino, no cada vez que abres la aplicación. Y la
 * primera vez que Atreus recorre tu biblioteca se encuentra con los platinos
 * que ya tenías de antes —tres, en una biblioteca normal—, que no deben
 * desfilar uno detrás de otro celebrando algo que hiciste hace meses.
 *
 * La regla va **por juego**, no por biblioteca: la primera vez que Atreus
 * calcula un juego concreto, si ya está al 100 % se apunta callando, porque ese
 * platino es anterior a que Atreus supiera de él. A partir de ahí, que ese
 * juego llegue al 100 % sí es noticia. Ver `registrar`.
 */

const file = join(paths.root, 'platinos.json');

interface Store {
  /**
   * Vestigio de cuando la decisión era global. Ya no se lee para decidir nada
   * —lo hace `yaConocido`, por juego— pero se conserva al guardar para no
   * romper un `platinos.json` escrito por una versión anterior.
   */
  sembrado: boolean;
  /** gameId → epoch en segundos en que Atreus lo vio completo. */
  juegos: Record<GameId, number>;
}

let store: Store | null = null;

function load(): Store {
  if (store) return store;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Store>;
    store = {
      sembrado: raw.sembrado === true,
      juegos: raw.juegos && typeof raw.juegos === 'object' ? raw.juegos : {},
    };
  } catch {
    store = { sembrado: false, juegos: {} };
  }
  return store;
}

function persist(): void {
  if (!store) return;
  try {
    const temp = `${file}.tmp`;
    writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
    renameSync(temp, file);
  } catch (e) {
    logger.warn('no se pudo guardar la lista de platinos:', e);
  }
}

/**
 * Apunta que un juego está al 100 %. Devuelve true solo si hay que celebrarlo.
 *
 * `yaConocido` es la clave, y es **por juego**: dice si Atreus ya había
 * calculado este juego alguna vez antes de ahora. Si no lo había calculado
 * nunca, su 100 % es anterior a que Atreus supiera de él —lo terminaste antes
 * de instalar esto, o antes de que le llegara el turno en el cálculo— y se
 * apunta callando.
 *
 * Antes esto lo decidía una marca global de "biblioteca ya sembrada", que se
 * cerraba al acabar la primera pasada del calentamiento. El problema es que
 * una pasada termina igual aunque haya juegos que no se llegaron a calcular:
 * si su consulta falla, o si se los salta porque había una partida abierta. Ese
 * juego se calculaba días después, con la siembra ya cerrada, y su platino de
 * hace meses se anunciaba como recién conseguido. Pasó de verdad, con
 * `platinos.json` diciendo `sembrado: true` y cinco juegos dentro.
 *
 * Se relee del disco en vez de fiarse de la copia en memoria: es una escritura
 * rara —solo al completar un juego— y así dos instancias abiertas a la vez no
 * pueden celebrar el mismo platino dos veces, que también se vio en el registro.
 */
export function registrar(gameId: GameId, yaConocido: boolean): boolean {
  store = null;
  const datos = load();
  const decision = decidirCelebracion(Boolean(datos.juegos[gameId]), yaConocido);
  if (decision === 'nada') return false;

  datos.juegos[gameId] = Math.floor(Date.now() / 1000);
  persist();

  if (decision === 'apuntar-callando') {
    logger.info(`${gameId} ya estaba al 100 % la primera vez que Atreus lo miró; se apunta sin celebrar`);
    return false;
  }
  logger.info(`¡platino nuevo en ${gameId}!`);
  return true;
}

/** Olvida un juego, para poder volver a ver su celebración. */
export function olvidar(gameId: GameId): void {
  const datos = load();
  if (!(gameId in datos.juegos)) return;
  delete datos.juegos[gameId];
  persist();
}
