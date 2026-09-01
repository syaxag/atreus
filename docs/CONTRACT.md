# Contrato IPC — reglas de reparto entre las dos sesiones de construcción

El contrato son dos archivos, y están **congelados**:

- `src/shared/types.ts` — tipos de dominio (`Game`, `Achievement`, `CheatDef`, …).
- `src/shared/ipc.ts` — `AtreusApi`, `AtreusEvents`, `IPC_CHANNELS`, `ok()`, `err()`.

## Reglas

1. **Nadie edita `src/shared/` sin acuerdo previo.** Si una sesión necesita un campo
   nuevo, se detiene y lo pide. Es la única dependencia dura entre las dos.
2. **Todo método devuelve `Result<T>`.** Nunca se lanza una excepción a través del IPC.
   El main captura y devuelve `err(mensaje)`.
3. **Los nombres de canal se derivan de la forma `dominio.metodo`.**
   `library.scan` → `ipcMain.handle('library.scan', …)`.
4. **Los eventos push usan `dominio:evento`** (dos puntos, no punto) para no
   confundirlos con los canales de invocación.
5. El renderer **nunca** importa nada de `src/main/`. Solo `src/shared/` y su propio árbol.

## Cómo lo implementa el Lado A (backend)

```ts
// src/main/ipc/register.ts
import { ipcMain } from 'electron';
import { ok, err } from '../../shared/ipc';

ipcMain.handle('library.scan', async () => {
  try {
    return ok(await catalog.scan());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
});
```

Y el preload lo reexpone con la forma anidada de `AtreusApi`:

```ts
// src/preload/index.ts
contextBridge.exposeInMainWorld('atreus', {
  library: {
    scan: () => ipcRenderer.invoke('library.scan'),
    // …
  },
  on: (channel, handler) => {
    const wrapped = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
});
```

## Cómo lo consume el Lado B (interfaz)

```ts
// src/renderer/lib/api.ts
import type { AtreusApi } from '../../shared/ipc';
import { mockApi } from '../mock/api';

const USE_MOCK = import.meta.env.VITE_MOCK === '1';
export const api: AtreusApi = USE_MOCK ? mockApi : (window as any).atreus;
```

Uso en un componente, siempre comprobando `ok`:

```ts
const res = await api.library.scan();
if (!res.ok) { toast.error(res.error); return; }
setGames(res.data);
```

## El mock es responsabilidad del Lado B

`src/renderer/mock/api.ts` implementa `AtreusApi` entero con datos falsos y latencia
simulada (150-400 ms) para que la UI de carga sea realista. Debe cubrir:

- ~10 juegos, incluyendo uno multijugador (para probar el estado `blocked`)
  y uno sin definición de cheats.
- ~40 logros de ejemplo, con ocultos y con fechas de desbloqueo.
- ~8 estadísticas, alguna increment-only.
- ~6 cheats repartidos en 2 grupos, de los tres tipos.
- ~5 mods, uno con conflicto y otro en error.
- Emisión periódica de eventos para probar los suscriptores.

Mientras `VITE_MOCK=1`, `npm run dev` levanta la UI sin depender del backend.

## Verificación del contrato

`npm run typecheck` compila los tres árboles contra `src/shared/`. Si una sesión rompe
el contrato, falla ahí antes que en tiempo de ejecución. **Ejecutarlo antes de cada
punto de sincronía.**
