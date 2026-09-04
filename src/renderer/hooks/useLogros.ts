import { useCallback, useEffect, useState } from 'react';
import type { Achievement, AchievementSet, GameStat, SteamSnapshot } from '@shared/types';
import { api } from '@/lib/api';
import { useTurno } from '@/lib/vigencia';

/**
 * Traer los logros de un juego, con lo que los acompaña.
 *
 * Sale de `AchievementsView`, que tenía 797 líneas y dieciocho `useState`
 * mezclando tres cosas distintas: de dónde vienen los datos, qué has cambiado
 * sin guardar, y cómo se pinta. Lo que se muda aquí es solo la primera —los
 * borradores se quedan en la vista, porque son de la vista— y con ella se va
 * el guardia de vigencia, que es lo que hacía falta que viviera en un sitio.
 *
 * `stats` y `backups` cuelgan de la misma carga a propósito: solo existen
 * cuando manda el cliente de Steam, y saberlo es parte de la respuesta.
 */

export interface Logros {
  /** De dónde salen los logros y si se pueden escribir. Manda sobre la vista. */
  set: AchievementSet | null;
  items: Achievement[];
  stats: GameStat[];
  backups: SteamSnapshot[];
  cargando: boolean;
  error: string | null;
  /** Vuelve a pedirlo todo. Lo que estuviera en el aire deja de contar. */
  recargar: () => Promise<void>;
}

export function useLogros(gameId: string | undefined, appId: string | undefined): Logros {
  const [set, setSet] = useState<AchievementSet | null>(null);
  const [items, setItems] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<GameStat[]>([]);
  const [backups, setBackups] = useState<SteamSnapshot[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turno = useTurno();

  const recargar = useCallback(async () => {
    if (!gameId) return;
    /*
     * Steam tarda segundos y la barra lateral está a un clic: sin esto, abrir
     * un juego y saltar a otro pintaba los logros del primero sobre el
     * segundo. Ver `lib/vigencia.ts`.
     */
    const vigente = turno();
    setCargando(true);
    setError(null);

    // Una sola llamada, valga el juego de la tienda que valga: el backend
    // decide si puede hablar con Steam o si toca el catálogo público.
    const respuesta = await api.achievements.list(gameId);
    if (!vigente()) return;

    if (!respuesta.ok) {
      setError(respuesta.error);
      setCargando(false);
      return;
    }
    setSet(respuesta.data);
    setItems(respuesta.data.items);

    // Estadísticas e historial solo existen cuando manda el cliente de Steam.
    if (respuesta.data.writable && appId) {
      const [s, b] = await Promise.all([api.steam.stats(appId), api.steam.backups(appId)]);
      if (!vigente()) return;
      if (s.ok) setStats(s.data);
      if (b.ok) setBackups(b.data);
    } else {
      setStats([]);
      setBackups([]);
    }
    setCargando(false);
  }, [gameId, appId, turno]);

  useEffect(() => {
    void recargar();
    // Cada sesión es un proceso hijo de Steam. Sin este cierre, visitar cinco
    // juegos deja cinco procesos vivos hasta que se cierre la app.
    return () => { if (appId) void api.steam.close(appId); };
  }, [recargar, appId]);

  // Al cambiar de juego se descarta lo anterior en vez de enseñar los logros
  // del juego previo mientras cargan los nuevos.
  useEffect(() => {
    setSet(null);
    setItems([]);
    setStats([]);
  }, [gameId]);

  return { set, items, stats, backups, cargando, error, recargar };
}
