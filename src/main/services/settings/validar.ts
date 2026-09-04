import type { Settings } from '@shared/types';

/**
 * Qué se admite en cada ajuste.
 *
 * `setSettings(patch)` tomaba un parcial arbitrario del renderer y lo mezclaba
 * sin mirar. Un valor de otro tipo —por una llamada mal escrita, por un
 * `settings.json` editado a mano, por un ajuste que cambió de forma entre dos
 * versiones— se persistía y **sobrevivía al reinicio**, así que un fallo de un
 * momento se quedaba a vivir en el disco.
 *
 * La regla es la del resto de Atreus: lo que no encaja se descarta con el
 * motivo escrito y **el resto del parche se aplica igual**. Un ajuste malo no
 * debe hacer que se pierdan los otros cuatro que iban en la misma llamada.
 *
 * Sin Electron: se prueba con objetos sueltos.
 */

export interface Rechazo {
  clave: string;
  motivo: string;
}

export interface Revision {
  /** Lo que se acepta, ya con los tipos correctos. */
  limpio: Partial<Settings>;
  /** Lo que se descarta, y por qué. */
  rechazos: Rechazo[];
}

const IDIOMAS = ['es', 'en', 'pt'] as const;
const TEMAS = ['dark', 'light'] as const;

const esBooleano = (v: unknown) => typeof v === 'boolean';
const esTextoOVacio = (v: unknown) => v === null || typeof v === 'string';

/**
 * Un color de acento en hexadecimal.
 *
 * Va directo a una variable CSS, así que no puede ser cualquier cadena: sin
 * esto, un valor con `;` se cuela en la hoja de estilos.
 */
const esColor = (v: unknown) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Un origen: una carpeta, una URL, o vacío.
 *
 * Aquí no se exige HTTPS —eso lo hace quien sincroniza, con el motivo
 * completo—, solo que sea una cadena. Rechazarlo aquí daría un mensaje peor y
 * en el sitio equivocado.
 */
const esOrigen = (v: unknown) => typeof v === 'string';

type Comprobacion = { prueba: (v: unknown) => boolean; espera: string };

const REGLAS: Record<keyof Settings, Comprobacion> = {
  theme: { prueba: (v) => TEMAS.includes(v as (typeof TEMAS)[number]), espera: TEMAS.join(' o ') },
  accent: { prueba: esColor, espera: 'un color como "#8b5cf6"' },
  language: { prueba: (v) => IDIOMAS.includes(v as (typeof IDIOMAS)[number]), espera: IDIOMAS.join(', ') },

  steamPath: { prueba: esTextoOVacio, espera: 'una ruta o nada' },
  steamWebApiKey: { prueba: esTextoOVacio, espera: 'una clave o nada' },
  xboxApiKey: { prueba: esTextoOVacio, espera: 'una clave o nada' },

  catalogSource: { prueba: esOrigen, espera: 'una carpeta o una URL' },
  updateSource: { prueba: esOrigen, espera: 'una URL https o nada' },

  scanOnStart: { prueba: esBooleano, espera: 'sí o no' },
  minimizeToTray: { prueba: esBooleano, espera: 'sí o no' },
  autoSyncCatalog: { prueba: esBooleano, espera: 'sí o no' },
  checkForAppUpdates: { prueba: esBooleano, espera: 'sí o no' },
  autoDownloadUpdates: { prueba: esBooleano, espera: 'sí o no' },
  achievementRiskAccepted: { prueba: esBooleano, espera: 'sí o no' },
  celebrationSound: { prueba: esBooleano, espera: 'sí o no' },
};

/** Separa lo que se puede guardar de lo que no. */
export function revisar(patch: unknown): Revision {
  const limpio: Partial<Settings> = {};
  const rechazos: Rechazo[] = [];

  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return { limpio, rechazos: [{ clave: '(todo)', motivo: 'el parche no es un objeto' }] };
  }

  for (const [clave, valor] of Object.entries(patch)) {
    // Un ajuste que no existe no se guarda: si no, `settings.json` acumula
    // basura de versiones viejas y de llamadas mal escritas.
    const regla = REGLAS[clave as keyof Settings];
    if (!regla) {
      rechazos.push({ clave, motivo: 'no es un ajuste de Atreus' });
      continue;
    }
    if (valor === undefined) continue; // no tocar no es lo mismo que borrar

    if (!regla.prueba(valor)) {
      rechazos.push({
        clave,
        motivo: `se esperaba ${regla.espera} y llegó ${describir(valor)}`,
      });
      continue;
    }
    (limpio as Record<string, unknown>)[clave] = valor;
  }

  return { limpio, rechazos };
}

/** Cómo nombrar lo que llegó, para que el aviso del registro sirva de algo. */
function describir(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return 'una lista';
  const tipo = typeof valor;
  if (tipo === 'string') return `el texto ${JSON.stringify(valor)}`;
  if (tipo === 'object') return 'un objeto';
  return `${tipo} (${String(valor)})`;
}

/**
 * Lo mismo, pero para lo que se lee del disco.
 *
 * Un `settings.json` de una versión anterior o editado a mano no debe tumbar el
 * arranque ni colar un valor imposible: lo que no encaja cae a su valor por
 * defecto, callando —al arrancar no hay a quién avisar— pero dejándolo escrito.
 */
export function revisarGuardado(crudo: unknown): Revision {
  return revisar(crudo);
}
