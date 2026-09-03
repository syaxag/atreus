import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, FolderOpen, ScrollText, RefreshCw, ExternalLink, FolderCode, Package } from 'lucide-react';
import type { SteamKeyStatus, XboxKeyStatus } from '@shared/types';
import { api, usingMock } from '@/lib/api';
import { useStore } from '@/store';
import { relative } from '@/lib/format';
import { IDIOMAS, useT, type Clave, type Huecos } from '@/i18n';
import { Badge, Button, Card, Input, Toggle, ViewHeader } from '@/components/ui';

interface KeyCheck {
  ok: boolean; persona: string | null; publicProfile: boolean; status: SteamKeyStatus;
}
interface XboxCheck {
  ok: boolean; gamertag: string | null; titles: number; status: XboxKeyStatus;
}

export function SettingsView() {
  const t = useT();
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
    pushToast('info', t('ajustes.actualizacionDisponible', { version: nextVersion }));
  }), [pushToast, t]);
  useEffect(() => api.on('update:progress', ({ percent }) => setUpdateProgress(percent)), []);
  useEffect(() => api.on('update:downloaded', () => { setUpdateProgress(100); setInstallingUpdate(false); }), []);

  if (!settings) return null;

  async function pickSteam() {
    const res = await api.settings.pickFolder(t('ajustes.elegirCarpetaSteam'));
    if (!res.ok) return pushToast('error', res.error);
    if (res.data) void patch({ steamPath: res.data });
  }

  async function pickCatalogFolder() {
    const res = await api.settings.pickFolder(t('ajustes.elegirCarpetaDefs'));
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
        ? t('ajustes.sinCambios', { total: res.data.total })
        : t('ajustes.definicionesActualizadas', { n: res.data.updated, total: res.data.total }),
    );
    void loadCatalog();
  }

  async function checkForUpdate() {
    setCheckingUpdate(true);
    const res = await api.app.checkForUpdates();
    setCheckingUpdate(false);
    if (!res.ok) return pushToast('error', res.error);
    // Se desestructura para que el número entre en el hueco ya comprobado: el
    // contrato admite `available` sin versión, y el texto anterior lo habría
    // escrito como "la versión null".
    const { available, version: nueva } = res.data;
    setUpdateVersion(available ? nueva : null);
    pushToast(
      available ? 'success' : 'info',
      available && nueva
        ? t('ajustes.disponibleVersion', { version: nueva })
        : t('ajustes.yaAlDia'),
    );
  }

  async function installUpdate() {
    setInstallingUpdate(true);
    setUpdateProgress(0);
    const res = await api.app.downloadUpdate();
    setInstallingUpdate(false);
    if (!res.ok) return pushToast('error', res.error);
    pushToast('info', t('ajustes.descargandoAviso'));
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
        title={t('lateral.ajustes')}
        subtitle={`Atreus ${version}${usingMock ? ` · ${t('ajustes.modoPrueba')}` : ''}`}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">

          <Section title="Steam" defaultOpen>
            <Row label={t('ajustes.carpetaSteam')} hint={t('ajustes.carpetaSteamPista')}>
              <div className="flex w-96 gap-2">
                <Input value={settings.steamPath ?? ''} readOnly
                       placeholder={t('ajustes.sinDetectar')} className="w-full font-mono text-[12px]" />
                <Button variant="outline" onClick={pickSteam}>
                  <FolderOpen size={14} />
                </Button>
              </div>
            </Row>

            <Row label={t('ajustes.claveSteam')} hint={t('ajustes.claveSteamPista')}>
              <div className="flex w-96 flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onBlur={() => void patch({ steamWebApiKey: apiKey || null })}
                    placeholder={t('ajustes.sinConfigurar')}
                    className="w-full font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void api.settings.openPath('https://steamcommunity.com/dev/apikey')}
                    aria-label={t('ajustes.obtenerClave')}
                    title={t('ajustes.obtenerClaveSteamPista')}
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
                    {t(checkingKey ? 'ajustes.comprobando' : 'ajustes.comprobarClave')}
                  </Button>
                  {keyCheck && (
                    <span className={`text-[12px] leading-4 ${keyCheck.ok && keyCheck.publicProfile ? 'text-success' : keyCheck.ok ? 'text-warn' : 'text-danger'}`}>
                      {explicarClaveSteam(t, keyCheck)}
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
            <Row label={t('ajustes.claveXbox')} hint={t('ajustes.claveXboxPista')}>
              <div className="flex w-96 flex-col gap-2">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={xboxKey}
                    onChange={(event) => setXboxKey(event.target.value)}
                    onBlur={() => void patch({ xboxApiKey: xboxKey || null })}
                    placeholder={t('ajustes.sinConfigurar')}
                    className="w-full font-mono text-[12px]"
                  />
                  <Button
                    variant="outline"
                    onClick={() => void api.settings.openPath('https://xbl.io/')}
                    aria-label={t('ajustes.obtenerClaveXbox')}
                    title={t('ajustes.obtenerClaveXboxPista')}
                  >
                    <ExternalLink size={14} />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" disabled={checkingXbox || !xboxKey}
                          onClick={() => void checkXbox()}>
                    <RefreshCw size={13} className={checkingXbox ? 'animate-spin' : undefined} />
                    {t(checkingXbox ? 'ajustes.comprobando' : 'ajustes.comprobarClave')}
                  </Button>
                  {xboxCheck && (
                    <span className={`text-[12px] leading-4 ${xboxCheck.ok && xboxCheck.titles > 0 ? 'text-success' : xboxCheck.ok ? 'text-warn' : 'text-danger'}`}>
                      {explicarClaveXbox(t, xboxCheck)}
                    </span>
                  )}
                </div>
              </div>
            </Row>
          </Section>

          <Section title={t('ajustes.secBiblioteca')} defaultOpen>
            {/* El idioma va el primero de esta sección: es lo que cambia todo
                lo demás que se lee debajo. Se aplica al momento, sin reiniciar,
                porque el traductor está suscrito a los ajustes. */}
            <Row label={t('ajustes.idioma')} hint={t('ajustes.idiomaPista')}>
              <div className="flex gap-1 rounded-sm border border-line p-0.5">
                {IDIOMAS.map((idioma) => (
                  <Button
                    key={idioma.id}
                    size="sm"
                    variant={settings.language === idioma.id ? 'primary' : 'ghost'}
                    onClick={() => void patch({ language: idioma.id })}
                  >
                    {t(idioma.clave)}
                  </Button>
                ))}
              </div>
            </Row>
            <Row label={t('ajustes.escanearArranque')} hint={t('ajustes.escanearArranquePista')}>
              <Toggle checked={settings.scanOnStart}
                      onChange={(v) => void patch({ scanOnStart: v })} />
            </Row>
            <Row label={t('ajustes.minimizarBandeja')} hint={t('ajustes.minimizarBandejaPista')}>
              <Toggle checked={settings.minimizeToTray}
                      onChange={(v) => void patch({ minimizeToTray: v })} />
            </Row>
            {/*
              El aviso de logros se acepta una sola vez, así que el único modo
              de volver a verlo es este interruptor. Va aquí, en Ajustes, y no
              escondido: quien lo aceptó sin leer tiene que poder deshacerlo.
            */}
            <Row label={t('ajustes.sonidoPlatino')} hint={t('ajustes.sonidoPlatinoPista')}>
              <Toggle checked={settings.celebrationSound}
                      onChange={(v) => void patch({ celebrationSound: v })} />
            </Row>
            <Row label={t('ajustes.avisarLogros')} hint={t('ajustes.avisarLogrosPista')}>
              <Toggle checked={!settings.achievementRiskAccepted}
                      onChange={(v) => void patch({ achievementRiskAccepted: !v })} />
            </Row>
          </Section>

          <Section title={t('ajustes.secCatalogo')}>
            <Row
              label={t('ajustes.carpetaDefiniciones')}
              hint={t('ajustes.carpetaDefinicionesPista')}
            >
              <Button variant="outline" onClick={() => void api.settings.openPath('defs')}>
                <FolderCode size={14} /> {t('ajustes.abrirCarpeta')}
              </Button>
            </Row>

            <Row
              label={t('ajustes.origenSincronizar')}
              hint={t('ajustes.origenSincronizarPista')}
            >
              <div className="flex w-96 gap-2">
                <Input
                  value={settings.catalogSource}
                  onChange={(e) => void patch({ catalogSource: e.target.value })}
                  placeholder={t('ajustes.sinOrigen')}
                  className="w-full font-mono text-[12px]"
                />
                <Button variant="outline" onClick={pickCatalogFolder} aria-label={t('ajustes.elegirCarpeta')}>
                  <FolderOpen size={14} />
                </Button>
              </div>
            </Row>

            <Row
              label={t('ajustes.sincronizarAhora')}
              hint={
                !catalog
                  ? t('ajustes.sincronizarAhoraPista')
                  : catalog.updatedAt
                    ? t('ajustes.catalogoUltimaVez', {
                      version: catalog.version, cuando: relative(catalog.updatedAt),
                    })
                    : catalog.version
              }
            >
              <Button
                variant="outline"
                onClick={syncCatalog}
                disabled={syncing || !settings.catalogSource.trim()}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : undefined} />
                {t(syncing ? 'ajustes.sincronizando' : 'ajustes.sincronizar')}
              </Button>
            </Row>

            <Row
              label={t('ajustes.autoContenido')}
              hint={t('ajustes.autoContenidoPista')}
            >
              <Toggle
                checked={settings.autoSyncCatalog}
                onChange={(value) => void patch({ autoSyncCatalog: value })}
              />
            </Row>

            <Row label={t('ajustes.carpetaMods')} hint={t('ajustes.carpetaModsPista')}>
              <Button variant="outline" onClick={() => void api.settings.openPath('mods')}>
                <Package size={14} /> {t('ajustes.abrirCarpeta')}
              </Button>
            </Row>
          </Section>

          <Section title={t('ajustes.secActualizaciones')}>
            <Row
              label={t('ajustes.origenVersiones')}
              hint={t('ajustes.origenVersionesPista')}
            >
              <Input
                value={settings.updateSource}
                onChange={(event) => void patch({ updateSource: event.target.value })}
                placeholder="https://updates.tudominio.com/atreus"
                className="w-96 max-w-full font-mono text-[12px]"
              />
            </Row>
            <Row
              label={t('ajustes.buscarArranque')}
              hint={t('ajustes.buscarArranquePista')}
            >
              <Toggle
                checked={settings.checkForAppUpdates}
                onChange={(value) => void patch({ checkForAppUpdates: value })}
              />
            </Row>
            <Row
              label={t('ajustes.descargarAuto')}
              hint={t('ajustes.descargarAutoPista')}
            >
              <Toggle
                checked={settings.autoDownloadUpdates}
                disabled={!settings.updateSource.trim()}
                onChange={(value) => void patch({ autoDownloadUpdates: value })}
              />
            </Row>
            <Row label={t('ajustes.registro')} hint={t('ajustes.registroPista')}>
              <Button variant="outline" onClick={() => void api.app.openLogs()}>
                <ScrollText size={14} /> {t('ajustes.abrirCarpeta')}
              </Button>
            </Row>
            <Row
              label={t('ajustes.buscarApp')}
              hint={t('ajustes.buscarAppPista', { version })}
            >
              <div className="flex items-center gap-2">
                {updateVersion && (
                  <Button variant="primary" onClick={installUpdate} disabled={installingUpdate}>
                    <Package size={14} />
                    {installingUpdate
                      ? t('ajustes.descargandoPct', { pct: Math.round(updateProgress ?? 0) })
                      : t('ajustes.instalarVersion', { version: updateVersion })}
                  </Button>
                )}
                <Button variant="outline" onClick={checkForUpdate} disabled={checkingUpdate}>
                  <RefreshCw size={14} className={checkingUpdate ? 'animate-spin' : undefined} />
                  {t(checkingUpdate ? 'ajustes.buscando' : 'ajustes.comprobar')}
                </Button>
              </div>
            </Row>
          </Section>

          <Card className="px-4 py-3">
            <div className="flex items-start gap-3">
              <Badge tone="warn">{t('ajustes.alcance')}</Badge>
              <p className="text-[12px] leading-relaxed text-muted">{t('ajustes.alcanceCuerpo')}</p>
            </div>
          </Card>

        </div>
      </div>
    </div>
  );
}

/**
 * Qué ha contestado la comprobación de la clave.
 *
 * El backend manda el caso y la cuenta; la frase se escribe aquí. Antes la
 * mandaba redactada y era lo último de Ajustes que seguía en castellano con
 * la interfaz en inglés.
 */
function explicarClaveSteam(t: (clave: Clave, huecos?: Huecos) => string, check: KeyCheck): string {
  const cuenta = check.persona ?? t('ajustes.tuCuenta');
  switch (check.status) {
    case 'badFormat': return t('ajustes.claveFormato');
    case 'noSteamId': return t('ajustes.claveSinSteamId');
    case 'rejected': return t('ajustes.claveRechazada');
    case 'ok': return t('ajustes.claveCorrecta', { cuenta });
    case 'privateProfile': return t('ajustes.clavePerfilPrivado', { cuenta });
  }
}

function explicarClaveXbox(t: (clave: Clave, huecos?: Huecos) => string, check: XboxCheck): string {
  const cuenta = check.gamertag ?? t('ajustes.tuCuenta');
  switch (check.status) {
    case 'noKey': return t('ajustes.xboxSinClave');
    case 'rejected': return t('ajustes.xboxRechazada');
    case 'emptyHistory': return t('ajustes.xboxHistorialVacio', { cuenta });
    case 'ok':
      return t(check.titles === 1 ? 'ajustes.xboxConectadoUno' : 'ajustes.xboxConectado',
        { cuenta, n: check.titles });
  }
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
