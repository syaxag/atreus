import type { Settings } from '@shared/types';

/**
 * Las dos claves de API, cifradas en el disco.
 *
 * `steamWebApiKey` y `xboxApiKey` se guardaban en claro en `settings.json`.
 * No es lo peor del mundo —son claves de solo lectura de un perfil propio, y
 * quien pueda leer ese archivo ya está dentro de la cuenta—, pero cifrarlas es
 * barato: Electron trae `safeStorage`, que en Windows es DPAPI y ata el
 * secreto a la cuenta de usuario.
 *
 * Tres cuidados, que importan más que el cifrado en sí:
 *
 *  1. **Si no hay cifrado disponible, se guarda en claro y se dice.** Perder
 *     una clave por no poder cifrarla sería un arreglo peor que el problema.
 *  2. **Una clave ya guardada en claro se lee igual.** Nadie tiene que volver
 *     a pegarla: se cifra sola en el siguiente guardado.
 *  3. **La forma de `Settings` no cambia.** El cifrado vive en el borde del
 *     disco; el resto de la aplicación sigue viendo una cadena.
 */

/** Las claves que se cifran. Si mañana hay una tercera, se añade aquí. */
export const SECRETOS = ['steamWebApiKey', 'xboxApiKey'] as const;
export type Secreto = (typeof SECRETOS)[number];

/**
 * Marca de lo cifrado.
 *
 * Hace falta para distinguir un valor cifrado de una clave en claro escrita a
 * mano, que es lo que hay en el archivo de cualquiera que ya usara Atreus.
 */
const MARCA = 'atreus:v1:';

/** Lo que este módulo necesita de `safeStorage`, y nada más. */
export interface Cofre {
  isEncryptionAvailable(): boolean;
  encryptString(texto: string): Buffer;
  decryptString(buffer: Buffer): string;
}

export interface Resultado<T> {
  valor: T;
  /** Lo que hay que contar en el registro. Vacío cuando no hubo nada raro. */
  avisos: string[];
}

/** Cifra los secretos de un objeto de ajustes, para escribirlo. */
export function cifrar(settings: Settings, cofre: Cofre): Resultado<Settings> {
  const avisos: string[] = [];
  const salida = { ...settings };

  let disponible: boolean;
  try {
    disponible = cofre.isEncryptionAvailable();
  } catch {
    disponible = false;
  }

  if (!disponible) {
    // Se deja tal cual y se dice. Ver el cuidado 1.
    if (SECRETOS.some((clave) => settings[clave])) {
      avisos.push(
        'el cifrado del sistema no está disponible: las claves de API se guardan en claro',
      );
    }
    return { valor: salida, avisos };
  }

  for (const clave of SECRETOS) {
    const valor = settings[clave];
    if (!valor || valor.startsWith(MARCA)) continue;
    try {
      salida[clave] = MARCA + cofre.encryptString(valor).toString('base64');
    } catch (e) {
      avisos.push(`no se pudo cifrar ${clave}, se guarda en claro: ${motivo(e)}`);
    }
  }
  return { valor: salida, avisos };
}

/** Descifra los secretos de lo leído del disco. */
export function descifrar(settings: Settings, cofre: Cofre): Resultado<Settings> {
  const avisos: string[] = [];
  const salida = { ...settings };

  for (const clave of SECRETOS) {
    const valor = settings[clave];
    if (!valor) continue;

    // Sin marca es una clave en claro de antes: vale tal cual. Ver el cuidado 2.
    if (!valor.startsWith(MARCA)) continue;

    try {
      salida[clave] = cofre.decryptString(Buffer.from(valor.slice(MARCA.length), 'base64'));
    } catch (e) {
      /*
       * Pasa de verdad: copiar `settings.json` a otro equipo o a otra cuenta
       * de Windows deja un secreto que DPAPI ya no sabe abrir. Se vacía la
       * clave —que es lo único honesto: no la tenemos— y se dice, para que en
       * Ajustes se vea el campo vacío y no una cadena ilegible.
       */
      salida[clave] = null;
      avisos.push(
        `no se pudo descifrar ${clave} (¿ajustes traídos de otro equipo?): ${motivo(e)}. ` +
        'Vuelve a pegarla en Ajustes.',
      );
    }
  }
  return { valor: salida, avisos };
}

function motivo(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
