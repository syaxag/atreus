/**
 * Añade `.ts` a lo que no se resuelva por sí solo.
 *
 * Solo a rutas relativas y solo cuando la resolución normal ha fallado: así no
 * se inventa nada para un paquete de `node_modules` ni tapa un import que de
 * verdad apunta a donde no hay nada — eso último seguiría fallando, ahora con
 * el mensaje de la segunda intentona.
 */
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto);
  } catch (error) {
    if (!especificador.startsWith('.')) throw error;
    return siguiente(`${especificador}.ts`, contexto);
  }
}
