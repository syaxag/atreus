import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen, ScrollText, RefreshCw, ExternalLink, FolderCode, Package } from 'lucide-react';
import { api, usingMock } from '@/lib/api';
import { useStore } from '@/store';
import { relative } from '@/lib/format';
import { Badge, Button, Card, Input, Toggle, ViewHeader } from '@/components/ui';

interface KeyCheck { ok: boolean; persona: string | null; publicProfile: boolean; message: string }
interface XboxCheck { ok: boolean; gamertag: string | null; titles: number; message: string }

export function SettingsView() {
  const settings = useStore((s) => s.settings);
  const [checkingKey, setCheckingKey] = useState(false);
  const [keyCheck, setKeyCheck] = useState<KeyCheck | null>(null);
  const [xboxKey, setXboxKey] = useState('');
  const [checkingXbox, setCheckingXbox] = useState(false);
  const [xboxCheck, setXboxCheck] = useState<XboxCheck | null>(null);
  const patch = useStore((s) => s.patchSettings);
  const pushToast = useStore((s) => s.pushToast);

  const [version, setVersion] = useState('—');
  const [apiKey, setApiKey] = useState('');
  const [catalog, setCatalog] = useState<{ version: string; updatedAt: number } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updateVersion, setUpdateVersion] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

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
    setXboxKey(settings?.xboxApiKey ?? '');
  }, [settings?.steamWebApiKey]);

  useEffect(() => api.on('update:available', ({ version: nextVersion }) => {
    setUpdateVersion(nextVersion);
    pushToast('info', `Actualización disponible: Atreus ${nextVersion}`);
  }), [pushToast]);
  useEffect(() => api.on('update:progress', ({ percent }) => setUpdateProgress(percent)), []);
  useEffect(() => api.on('update:downloaded', () => { setUpdateProgress(100); setInstallingUpdate(false); }), []);

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

  async function checkForUpdate() {
    setCheckingUpdate(true);
    const res = await api.app.checkForUpdates();
    setCheckingUpdate(false);
    if (!res.ok) return pushToast('error', res.error);
    setUpdateVersion(res.data.available ? res.data.version : null);
    pushToast(
      res.data.available ? 'success' : 'info',
      res.data.available ? `Disponible la versión ${res.data.version}` : 'Ya estás en la última versión',
    );
  }

  async function installUpdate() {
    setInstallingUpdate(true);
    setUpdateProgress(0);
    const res = await api.app.downloadUpdate();
    setInstallingUpdate(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('info', 'Descargando actualización; Atreus se reiniciará al terminar.');
  }

  async function checkKey() {
    // Se guarda antes de comprobar: si no, se validaría la clave anterior.
    await patch({ steamWebApiKey: apiKey || null });
    setCheckingKey(true);
    const result = await api.steam.checkKey();
    setCheckingKey(false);
    if (!result.ok) return pushToast('error', result.error);
    setKeyCheck(result.data);
  }

  async function checkXbox() {
    await patch({ xboxApiKey: xboxKey || null });
    setCheckingXbox(true);
    const result = await api.xbox.checkKey();
    setCheckingXbox(false);
    if (!result.ok) return pushToast('error', result.error);
    setXboxCheck(result.data);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ViewHeader
        title="Ajustes"
        subtitle={`Atreus ${version}${usingMock ? ' · modo de prueba' : ''}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">

          <Section title="Steam" defaultOpen>
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

            <Row
              label="Clave de la Steam Web API"
              hint={'Opcional pero recomendable: con ella Atreus lee el progreso de toda tu biblioteca ' +
                'de una vez, sin abrir un proceso de Steam por juego. Tu perfil tiene que ser público.'}
            >
              <div className="flex w-96 flex-col gap-2">
                <div className="flex gap-2">
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
                    title="Conseguir una clave en Steam"
                  >
                    <ExternalLink size={14} />
                  </Button>
                </div>
                {/*
                  Una clave mal pegada o un perfil en privado no dan ningún
                  error: los logros simplemente no aparecen. Este botón es la
                  única forma de enterarse.
                */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={checkingKey || !apiKey}
                          onClick={() => void checkKey()}>
                    <RefreshCw size={13} className={checkingKey ? 'animate-spin' : undefined} />
                    {checkingKey ? 'Comprobando…' : 'Comprobar clave'}
                  </Button>
                  {keyCheck && (
                    <span className={`text-[12px] leading-4 ${keyCheck.ok && keyCheck.publicProfile ? 'text-success' : keyCheck.ok ? 'text-warn' : 'text-danger'}`}>
                      {keyCheck.message}
                    </span>
                  )}
                </div>
              </div>
            </Row>
          </Section>

          {/*
            Xbox Live no se consulta sin autenticarse y Atreus no pide
            contraseñas. OpenXBL es el punto medio: el usuario entra con su
            cuenta en la web de ellos, genera una clave y pega solo la clave.
          */}
          <Section title="Xbox">
            <Row
              label="Clave de OpenXBL"
              hint={'Opcional. Con ella Atreus lee tus logros de Xbox de verdad, con sus fechas, ' +
                'en vez de que los marques tú. La generas entrando con tu cuenta de Microsoft en ' +
                'xbl.io: Atreus solo maneja la clave y puedes revocarla cuando quieras.'}
            >
              <div className="flex w-96 flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={xboxKey}
                    onChange={(event) => setXboxKey(event.target.value)}
                    onBlur={() => void patch({ xboxApiKey: xboxKey || null })}
                    placeholder="Sin configurar"
                    className="w-full font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void api.settings.openPath('https://xbl.io/')}
                    aria-label="Conseguir una clave"
                    title="Conseguir una clave en xbl.io"
                  >
                    <ExternalLink size={14} />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={checkingXbox || !xboxKey}
                          onClick={() => void checkXbox()}>
                    <RefreshCw size={13} className={checkingXbox ? 'animate-spin' : undefined} />
                    {checkingXbox ? 'Comprobando…' : 'Comprobar clave'}
                  </Button>
                  {xboxCheck && (
                    <span className={`text-[12px] leading-4 ${xboxCheck.ok && xboxCheck.titles > 0 ? 'text-success' : xboxCheck.ok ? 'text-warn' : 'text-danger'}`}>
                      {xboxCheck.message}
                    </span>
                  )}
                </div>
              </div>
            </Row>
          </Section>

          <Section title="Biblioteca y comportamiento" defaultOpen>
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
            {/*
              El aviso de logros se acepta una sola vez, así que el único modo
              de volver a verlo es este interruptor. Va aquí, en Ajustes, y no
              escondido: quien lo aceptó sin leer tiene que poder deshacerlo.
            */}
            <Row label="Sonido al conseguir un platino"
                 hint="La celebración suena con una recompensa sintetizada por la propia aplicación; no descarga ni reproduce ningún archivo.">
              <Toggle checked={settings.celebrationSound}
                      onChange={(v) => void patch({ celebrationSound: v })} />
            </Row>
            <Row label="Avisar antes de desbloquear logros"
                 hint="Vuelve a mostrar la advertencia sobre desbloquear logros a mano la próxima vez que lo intentes.">
              <Toggle checked={!settings.achievementRiskAccepted}
                      onChange={(v) => void patch({ achievementRiskAccepted: !v })} />
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
              hint="Carpeta, ZIP, JSON suelto o manifiesto atreus.catalog/v1 con versión, hashes y retiradas de seguridad."
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

            <Row
              label="Actualizar contenido automáticamente"
              hint="Al abrir Atreus y cada seis horas busca nuevas fichas de juego: mapas y proveedores de mods. Las guías se consultan al abrir cada juego."
            >
              <Toggle
                checked={settings.autoSyncCatalog}
                onChange={(value) => void patch({ autoSyncCatalog: value })}
              />
            </Row>

            <Row label="Carpeta de mods" hint="Los mods instalados viven aquí, aparte de los juegos.">
              <Button variant="outline" onClick={() => void api.settings.openPath('mods')}>
                <Package size={14} /> Abrir carpeta
              </Button>
            </Row>
          </Section>

          <Section title="Actualizaciones de Atreus">
            <Row
              label="Origen de versiones"
              hint="Carpeta HTTPS de releases con latest.yml y el instalador de Atreus. Se configura una sola vez; después la app se actualiza desde aquí."
            >
              <Input
                value={settings.updateSource}
                onChange={(event) => void patch({ updateSource: event.target.value })}
                placeholder="https://updates.tudominio.com/atreus"
                className="w-96 max-w-full font-mono text-[12px]"
              />
            </Row>
            <Row
              label="Buscar actualizaciones al arrancar"
              hint="No interrumpe el inicio. Si hay una versión nueva, Atreus la muestra dentro de esta misma pantalla."
            >
              <Toggle
                checked={settings.checkForAppUpdates}
                onChange={(value) => void patch({ checkForAppUpdates: value })}
              />
            </Row>
            <Row
              label="Descargar actualizaciones automáticamente"
              hint="Solo descarga desde el origen HTTPS configurado. Se instalará al cerrar Atreus."
            >
              <Toggle
                checked={settings.autoDownloadUpdates}
                disabled={!settings.updateSource.trim()}
                onChange={(value) => void patch({ autoDownloadUpdates: value })}
              />
            </Row>
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
                'programa desde el origen configurado. El contenido de los juegos se actualiza ' +
                'por separado, arriba, sin reinstalar nada.'
              }
            >
              <div className="flex items-center gap-2">
                {updateVersion && (
                  <Button variant="primary" onClick={installUpdate} disabled={installingUpdate}>
                    <Package size={14} /> {installingUpdate ? `Descargando ${Math.round(updateProgress ?? 0)} %` : `Instalar ${updateVersion}`}
                  </Button>
                )}
                <Button variant="outline" onClick={checkForUpdate} disabled={checkingUpdate}>
                  <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : undefined} />
                  {checkingUpdate ? 'Buscando…' : 'Comprobar'}
                </Button>
              </div>
            </Row>
          </Section>

          <Card className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Badge tone="warn">Alcance</Badge>
              <p className="text-[12px] leading-relaxed text-muted">
                Atreus no modifica ni la memoria ni los archivos de tus juegos. Lee tu
                biblioteca, habla con el cliente de Steam para los logros, y todo lo demás
                —guías, mapas, rareza— son consultas a fuentes públicas. Los mods sí escriben
                en la carpeta del juego, y siempre avisan antes de hacerlo.
              </p>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

function Section({
  title, children, defaultOpen = false,
}: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-sm px-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint hover:text-muted focus-visible:outline-none">
        {title}
        <ChevronDown size={15} className="transition-transform duration-150 group-open:rotate-180" aria-hidden="true" />
      </summary>
      <Card className="mt-1 divide-y divide-[var(--border)]">{children}</Card>
    </details>
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
