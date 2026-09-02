import { appendFileSync, statSync, renameSync, existsSync } from 'node:fs';
import { paths } from './paths';

type Level = 'debug' | 'info' | 'warn' | 'error';

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, luego se rota a .old

/**
 * El registro se escribe **de forma síncrona**.
 *
 * Con un flujo con búfer, las últimas líneas se quedan sin volcar cuando el
 * proceso se va de golpe — y son justo esas las que dicen por qué se fue. Un
 * arranque escribe una docena de líneas: el coste de escribirlas a pelo no se
 * nota, y a cambio el registro siempre acaba en lo último que de verdad pasó.
 */
let rotado = false;

function rotarUnaVez(): void {
  if (rotado) return;
  rotado = true;
  // Rotación simple: un solo archivo previo.
  try {
    if (existsSync(paths.logFile) && statSync(paths.logFile).size > MAX_BYTES) {
      renameSync(paths.logFile, `${paths.logFile}.old`);
    }
  } catch {
    // Si la rotación falla no vale la pena romper el arranque.
  }
}

function write(level: Level, scope: string, args: unknown[]): void {
  const stamp = new Date().toISOString();
  const body = args
    .map((a) => (typeof a === 'string' ? a : inspect(a)))
    .join(' ');
  const line = `${stamp} ${level.toUpperCase().padEnd(5)} [${scope}] ${body}\n`;

  if (level === 'error') process.stderr.write(line);
  else process.stdout.write(line);

  try {
    rotarUnaVez();
    appendFileSync(paths.logFile, line);
  } catch {
    // Un fallo al escribir en disco no debe tumbar la app.
  }
}

function inspect(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}\n${value.stack ?? ''}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Devuelve un logger con un prefijo de ámbito. Ej: `log('steam')`. */
export function log(scope: string) {
  return {
    debug: (...a: unknown[]) => write('debug', scope, a),
    info: (...a: unknown[]) => write('info', scope, a),
    warn: (...a: unknown[]) => write('warn', scope, a),
    error: (...a: unknown[]) => write('error', scope, a),
  };
}
