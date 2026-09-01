import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FolderOpen, ScrollText, RefreshCw, ExternalLink, FolderCode, Package } from 'lucide-react';
import { api, usingMock } from '@/lib/api';
import { useStore } from '@/store';
import { relative } from '@/lib/format';
import { Badge, Button, Card, Input, Toggle, ViewHeader } from '@/components/ui';

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const patch = useStore((s) => s.patchSettings);
  const pushToast = useStore((s) => s.pushToast);

  const [version, setVersion] = useState('—');
  const [apiKey, setApiKey] = useState('');
  const [catalog, setCatalog] = useState<{ version: string; updatedAt: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const loadCatalog = useCallback(async () => {
    const res = await api.catalog.version();
    if (res.ok) setCatalog(res.data);
  }, []);

  useEffect(() => {
    void api.app.version().then((r) => { if (r.ok) setVersion(r.data); });
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setApiKey(settings?.steamWebApiKey ?? '');
  }, [settings?.steamWebApiKey]);

  if (!settings) return null;

  async function pickSteam() {
    const res = await api.settings.pickFolder('Elige la carpeta de instalación de Steam');
    if (!res.ok) return pushToast('error', res.error);
    if (res.data) void patch({ steamPath: res.data });
  }

  async function pickCatalogFolder() {
    const res = await api.settings.pickFolder('Elige la carpeta con las definiciones');
    if (!res.ok) return pushToast('error', res.error);
    if (res.data) void patch({ catalogSource: res.data });
  }

  async function syncCatalog() {
    setSyncing(true);
    const res = await api.catalog.sync();
    setSyncing(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast(
      'success',
      res.data.updated === 0
        ? `Sin cambios · ${res.data.total} definiciones`
        : `${res.data.updated} definiciones actualizadas · ${res.data.total} en total`,
    );
    void loadCatalog();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Ajustes"
        subtitle={`Atreus ${version}${usingMock ? ' · modo de prueba' : ''}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">

          <Section title="Steam">
            <Row label="Carpeta de Steam"
                 hint="Se detecta sola desde el registro; solo hace falta tocarla si tienes una instalación portátil.">
              <div className="flex w-96 gap-2">
                <Input value={settings.steamPath ?? ''} readOnly
                       placeholder="Sin detectar" className="w-full font-mono text-[12px]" />
                <Button variant="outline" onClick={pickSteam}>
                  <FolderOpen size={14} />
                </Button>
              </div>
            </Row>

            <Row label="Clave de la Steam Web API"
                 hint="Opcional. Solo se usa para descargar los nombres e iconos de los logros cuando no están en la caché local.">
              <div className="flex w-96 gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => void patch({ steamWebApiKey: apiKey || null })}
                  placeholder="Sin configurar"
                  className="w-full font-mono text-[12px]"
                />
                <Button
                  variant="outline"
                  onClick={() => void api.settings.openPath('https://steamcommunity.com/dev/apikey')}
                  aria-label="Obtener clave"
                >
                  <ExternalLink size={14} />
                </Button>
              </div>
            </Row>
          </Section>

          <Section title="Comportamiento">
            <Row label="Escanear al arrancar"
                 hint="Refresca la biblioteca cada vez que se abre Atreus.">
              <Toggle checked={settings.scanOnStart}
                      onChange={(v) => void patch({ scanOnStart: v })} />
            </Row>
            <Row label="Minimizar a la bandeja"
                 hint="Cerrar la ventana la oculta en vez de salir de la app.">
              <Toggle checked={settings.minimizeToTray}
                      onChange={(v) => void patch({ minimizeToTray: v })} />
            </Row>
            <Row label="Hotkeys globales"
                 hint="Permite activar cheats con el teclado sin salir del juego.">
              <Toggle checked={settings.hotkeysEnabled}
                      onChange={(v) => void patch({ hotkeysEnabled: v })} />
            </Row>
            <Row label="Confirmar cheats con aviso"
                 hint="Pide confirmación antes de activar un cheat que lleve advertencia.">
              <Toggle checked={settings.confirmBeforeCheats}
                      onChange={(v) => void patch({ confirmBeforeCheats: v })} />
            </Row>
          </Section>

          <Section title="Catálogo de definiciones">
            <Row
              label="Carpeta de definiciones"
              hint="Aquí van los JSON de cada juego. Deja uno nuevo y aparece al momento, sin reinstalar ni reiniciar la app."
            >
              <Button variant="outline" onClick={() => void api.settings.openPath('defs')}>
                <FolderCode size={14} /> Abrir carpeta
              </Button>
            </Row>

            <Row
              label="Origen para sincronizar"
              hint="Una carpeta local, o una URL a un .zip (vale el de un repositorio de GitHub) o a un .json suelto."
            >
              <div className="flex w-96 gap-2">
                <Input
                  value={settings.catalogSource}
                  onChange={(e) => void patch({ catalogSource: e.target.value })}
                  placeholder="Sin origen · solo definiciones locales"
                  className="w-full font-mono text-[12px]"
                />
                <Button variant="outline" onClick={pickCatalogFolder} aria-label="Elegir carpeta">
                  <FolderOpen size={14} />
                </Button>
              </div>
            </Row>

            <Row
              label="Sincronizar ahora"
              hint={
                catalog
                  ? `${catalog.version}${
                      catalog.updatedAt
                        ? ` · última vez ${relative(catalog.updatedAt)}`
                        : ''
                    }`
                  : 'Descarga las definiciones nuevas o actualizadas.'
              }
            >
              <Button
                variant="outline"
                onClick={syncCatalog}
                disabled={syncing || !settings.catalogSource.trim()}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
                {syncing ? 'Sincronizando…' : 'Sincronizar'}
              </Button>
            </Row>

            <Row label="Carpeta de mods" hint="Los mods instalados viven aquí, aparte de los juegos.">
              <Button variant="outline" onClick={() => void api.settings.openPath('mods')}>
                <Package size={14} /> Abrir carpeta
              </Button>
            </Row>
          </Section>

          <Section title="Diagnóstico">
            <Row label="Registro de la aplicación"
                 hint="Todo lo que hace el backend queda aquí. Útil cuando algo falla en silencio.">
              <Button variant="outline" onClick={() => void api.app.openLogs()}>
                <ScrollText size={14} /> Abrir carpeta
              </Button>
            </Row>
            <Row
              label="Buscar actualizaciones de la app"
              hint={
                `Versión instalada: ${version}. Esto solo busca versiones nuevas del ` +
                'programa. Los juegos, cheats y mods se actualizan por separado, arriba, ' +
                'sin reinstalar nada.'
              }
            >
              <Button
                variant="outline"
                onClick={async () => {
                  const res = await api.app.checkForUpdates();
                  if (!res.ok) return pushToast('error', res.error);
                  pushToast(
                    res.data.available ? 'success' : 'info',
                    res.data.available
                      ? `Disponible la versión ${res.data.version}`
                      : 'Ya estás en la última versión',
                  );
                }}
              >
                <RefreshCw size={14} /> Comprobar
              </Button>
            </Row>
          </Section>

          <Card className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Badge tone="warn">Alcance</Badge>
              <p className="text-[12px] leading-relaxed text-muted">
                El motor de cheats no engancha a juegos multijugador ni intenta evadir
                sistemas anti-cheat. Esa comprobación no se puede desactivar desde aquí.
                Los logros sí están disponibles en cualquier juego de tu biblioteca.
              </p>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        {title}
      </h2>
      <Card className="divide-y divide-[var(--border)]">{children}</Card>
    </section>
  );
}

function Row({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-6">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] leading-snug text-faint">{hint}</p>}
      </div>
      <div className="max-w-full shrink-0">{children}</div>
    </div>
  );
}
