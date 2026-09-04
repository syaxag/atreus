import {
  useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction,
} from 'react';
import type { Mod, ModProfile, RemoteMod } from '@shared/types';
import { api } from '@/lib/api';
import { useTurno } from '@/lib/vigencia';

/**
 * Los mods de un juego: los instalados, sus perfiles y el catálogo público.
 *
 * Sale de `ModsView`, que tenía 843 líneas y diecinueve `useState`. Aquí van
 * las tres cargas y nada más; los diálogos, el arrastrar y soltar y el
 * comparador de perfiles se quedan en la vista, que es de donde son.
 *
 * El catálogo va aparte de los instalados **a propósito**: es la carga más
 * lenta de Atreus —sale a Thunderstore, GameBanana o Modrinth— y solo se pide
 * al abrir su pestaña. Juntarlas haría esperar por algo que igual no se mira.
 */

export interface Mods {
  mods: Mod[];
  profiles: ModProfile[];
  cargando: boolean;
  /** El catálogo público. `null` mientras no se haya pedido. */
  remote: RemoteMod[] | null;
  remoteError: string | null;
  cargandoRemote: boolean;
  /** Relee lo instalado y los perfiles. */
  recargar: () => Promise<void>;
  /** Consulta el catálogo público. */
  descubrir: () => Promise<void>;
  /**
   * Cambia la lista sin ir al backend, para que la interfaz responda al momento.
   *
   * **No ordena**, y eso es deliberado: al subir o bajar un mod en la lista de
   * carga, el orden nuevo está en las posiciones del array y los `order` de
   * cada mod siguen siendo los viejos hasta que conteste el backend. Ordenar
   * aquí deshacía el movimiento delante de quien acababa de hacerlo.
   */
  ponerMods: Dispatch<SetStateAction<Mod[]>>;
}

export function useMods(gameId: string | undefined, avisar: (mensaje: string) => void): Mods {
  const [mods, setMods] = useState<Mod[]>([]);
  const [profiles, setProfiles] = useState<ModProfile[]>([]);
  const [cargando, setCargando] = useState(false);
  const [remote, setRemote] = useState<RemoteMod[] | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [cargandoRemote, setCargandoRemote] = useState(false);
  const turno = useTurno();

  /*
   * Cómo avisar, por referencia y no por dependencia.
   *
   * La vista pasa `(mensaje) => pushToast('error', mensaje)`, que es lo normal
   * y es una función **nueva en cada render**. Con ella en las dependencias de
   * `recargar`, el efecto que la ejecuta se disparaba en cada render: cada
   * carga invalidaba el turno de la anterior —que por eso salía sin apagar
   * `cargando`— y encendía el suyo. El Taller se quedaba en esqueletos para
   * siempre, pidiendo la lista sin parar.
   *
   * Se arregla aquí y no en quien llama: pedirle a cada vista que memorice su
   * callback es una trampa que se olvida una vez y vuelve el mismo fallo.
   */
  const avisarRef = useRef(avisar);
  avisarRef.current = avisar;

  const ordenar = (lista: Mod[]) => [...lista].sort((a, b) => a.order - b.order);

  const recargar = useCallback(async () => {
    if (!gameId) return;
    const vigente = turno();
    setCargando(true);
    const [m, p] = await Promise.all([api.mods.list(gameId), api.mods.profiles(gameId)]);
    if (!vigente()) return;
    setMods(m.ok ? ordenar(m.data) : []);
    setProfiles(p.ok ? p.data : []);
    if (!m.ok) avisarRef.current(m.error);
    setCargando(false);
  }, [gameId, turno]);

  const descubrir = useCallback(async () => {
    if (!gameId) return;
    const vigente = turno();
    setCargandoRemote(true);
    setRemoteError(null);
    const res = await api.mods.discover(gameId);
    if (!vigente()) return;
    setCargandoRemote(false);
    if (!res.ok) { setRemoteError(res.error); setRemote(null); return; }
    setRemote(res.data);
  }, [gameId, turno]);

  useEffect(() => { void recargar(); }, [recargar]);

  // Al cambiar de juego se descarta el catálogo del anterior.
  useEffect(() => {
    setRemote(null);
    setRemoteError(null);
  }, [gameId]);

  // El backend avisa cuando algo cambia por su cuenta —instalar, desplegar,
  // activar un perfil—, así que la lista se mantiene sola sin volver a pedirla.
  useEffect(() => {
    const off = api.on('mods:updated', (payload) => {
      if (payload.gameId === gameId) setMods(ordenar(payload.mods));
    });
    return off;
  }, [gameId]);

  return {
    mods, profiles, cargando, remote, remoteError, cargandoRemote,
    recargar, descubrir, ponerMods: setMods,
  };
}
