import { isAbsolute, join, normalize, resolve, sep } from 'node:path';

/**
 * Dónde puede una definición pedir que se desplieguen sus mods.
 *
 * La raíz sale de `data/games/<id>.json`:
 *
 *   "mods": { "root": "%APPDATA%\\Balatro\\Mods" }
 *
 * y se admiten variables de entorno porque no todos los mods van al directorio
 * del juego. El problema era que se admitía **cualquier cosa**: la definición
 * podía decir `%SystemRoot%\System32` y ahí es donde `deploy()` escribe y
 * `purge()` borra y restaura. Y las definiciones no siempre las escribe quien
 * usa Atreus: se sincronizan de un origen remoto.
 *
 * Así que la raíz resuelta tiene que caer bajo el directorio del juego o bajo
 * una carpeta del usuario. Lo que no cae se rechaza **con el motivo escrito**,
 * porque una raíz rechazada en silencio es una definición que no funciona sin
 * decir por qué.
 *
 * Este módulo no importa nada de Electron a propósito: así se puede probar con
 * un entorno de mentira, que es lo único que hace falta para comprobarlo.
 */

export type Raiz =
  | { ok: true; root: string }
  | { ok: false; error: string };

/**
 * Las variables de entorno que marcan una carpeta del usuario.
 *
 * `USERPROFILE` cubre de paso `Documents`, `Saved Games` y `Downloads`, que es
 * donde guardan sus cosas casi todos los juegos que no usan `%APPDATA%`.
 */
const CARPETAS_DEL_USUARIO = ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE'] as const;

/** Expande `%VAR%` con el entorno que se le pase. */
function expandir(valor: string, env: NodeJS.ProcessEnv): string {
  return valor.replace(/%([^%]+)%/g, (_m, nombre: string) => env[nombre] ?? '');
}

/**
 * ¿Está `candidato` dentro de `contenedor`?
 *
 * Compara sin distinguir mayúsculas porque Windows tampoco las distingue, y
 * exige el separador para que `C:\Juegos2` no cuente como dentro de
 * `C:\Juegos`.
 */
export function dentroDe(candidato: string, contenedor: string): boolean {
  if (!contenedor) return false;
  const a = resolve(candidato).toLowerCase().replace(/[\\/]+$/, '');
  const b = resolve(contenedor).toLowerCase().replace(/[\\/]+$/, '');
  return a === b || a.startsWith(b + sep.toLowerCase()) || a.startsWith(b + '/');
}

/**
 * Resuelve la raíz de despliegue de una definición y dice si se acepta.
 *
 * - Sin `root`, la raíz es el directorio del juego.
 * - Con una ruta relativa, cuelga del directorio del juego.
 * - Con una ruta absoluta, tiene que caer bajo una carpeta del usuario.
 */
export function resolverRaiz(
  installDir: string | null,
  root: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Raiz {
  if (!root) {
    return installDir
      ? { ok: true, root: installDir }
      : { ok: false, error: 'No se sabe dónde está instalado el juego' };
  }

  const expandido = expandir(root, env).trim();
  if (!expandido) {
    return { ok: false, error: `La raíz de mods "${root}" se queda vacía al expandir sus variables` };
  }

  const absoluta = isAbsolute(expandido) || expandido.startsWith('\\\\') || /^[a-zA-Z]:[\\/]/.test(expandido);

  if (!absoluta) {
    if (!installDir) return { ok: false, error: 'No se sabe dónde está instalado el juego' };
    // Una relativa con `..` puede salirse igual del juego: se comprueba después
    // de juntarla, no antes.
    const juntada = normalize(join(installDir, expandido));
    return dentroDe(juntada, installDir)
      ? { ok: true, root: juntada }
      : {
        ok: false,
        error: `La raíz de mods "${root}" se sale del directorio del juego`,
      };
  }

  const destino = normalize(expandido);

  // Un recurso de red no se valida: no hay forma de decir qué hay al otro lado,
  // y desplegar mods a otra máquina no es algo que Atreus tenga que hacer.
  if (destino.startsWith('\\\\')) {
    return { ok: false, error: `La raíz de mods "${root}" apunta a un recurso de red` };
  }

  const permitidas = [
    ...(installDir ? [installDir] : []),
    ...CARPETAS_DEL_USUARIO.map((nombre) => env[nombre]).filter((v): v is string => !!v),
  ];

  if (permitidas.some((carpeta) => dentroDe(destino, carpeta))) {
    return { ok: true, root: destino };
  }

  return {
    ok: false,
    error:
      `La raíz de mods "${root}" apunta fuera del juego y de tus carpetas ` +
      `(${CARPETAS_DEL_USUARIO.map((n) => `%${n}%`).join(', ')}). ` +
      'Se rechaza: ahí es donde el despliegue escribe y donde purgar borra.',
  };
}
