import { useEffect, useMemo, useState } from 'react';
import { EyeOff, ShieldAlert } from 'lucide-react';
import type { Achievement } from '@shared/types';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n';
import { Button, Modal } from '@/components/ui';

/**
 * Las piezas de Trofeos que no son la lista de trofeos.
 *
 * El icono de un logro con su cadena de respaldos, el aviso de riesgo y su
 * viñeta. Ninguno toca el estado de la vista —todo entra por propiedades—, así
 * que estaban en el mismo archivo solo por costumbre.
 */

export function needsMap(achievement: Achievement): boolean {
  return /coleccion|collect|ubicaci[oó]n|location|mapa|map\b|tesoro|treasure|secreto|secret|reliquia|relic/i
    .test(`${achievement.displayName} ${achievement.description}`);
}

/**
 * El icono del logro, tal como lo enseña Steam.
 *
 * Steam publica dos imágenes por logro: la de color y la apagada. Antes se
 * cogía siempre la de color y se apagaba con un filtro CSS, que no es lo mismo
 * — la versión gris de Steam suele ser otro dibujo, no el mismo en gris. Ahora
 * se pide la que toca según el estado, con la otra de reserva y, como último
 * intento, el mismo archivo en el otro CDN de Valve: uno de los dos responde
 * casi siempre, y así el icono aparece incluso cuando el cliente todavía no lo
 * ha descargado a su caché.
 */
export function AchievementIcon({ achievement, unlocked }: { achievement: Achievement; unlocked: boolean }) {
  const chain = useMemo(() => {
    const preferred = unlocked ? achievement.iconUrl : achievement.iconGrayUrl;
    const other = unlocked ? achievement.iconGrayUrl : achievement.iconUrl;
    const urls = [preferred, other].filter((url): url is string => Boolean(url));
    // Valve sirve lo mismo desde dos dominios; si uno falla, el otro vale.
    const mirrors = urls
      .filter((url) => url.startsWith('https://cdn.cloudflare.steamstatic.com/'))
      .map((url) => url.replace('https://cdn.cloudflare.steamstatic.com/', 'https://media.steampowered.com/'));
    return [...new Set([...urls, ...mirrors])];
  }, [achievement.iconUrl, achievement.iconGrayUrl, unlocked]);

  const [index, setIndex] = useState(0);

  // Al cambiar de juego —o al pasar de bloqueado a desbloqueado— se vuelve a
  // empezar por la primera opción en vez de quedarse en la reserva anterior.
  useEffect(() => { setIndex(0); }, [chain]);

  const src = chain[index] ?? null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setIndex((value) => value + 1)}
        loading="lazy"
        decoding="async"
        className={cn(
          'h-full w-full object-cover transition-all duration-200 ease-atreus',
          // El icono gris de Steam ya viene apagado; bajarle más la opacidad
          // sería apagarlo dos veces.
          !unlocked && !achievement.iconGrayUrl && 'opacity-40 grayscale contrast-75',
          !unlocked && 'saturate-[.85]',
        )}
      />
    );
  }

  if (achievement.hidden) {
    return <EyeOff size={16} className={cn(!unlocked && 'opacity-40')} />;
  }

  return (
    <span className={cn('select-none font-bold', !unlocked && 'opacity-40')}>
      {achievement.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * El aviso antes de tocar un logro.
 *
 * Se sale del tono habitual de la aplicación a propósito: no es una nota al
 * pie, es la única pantalla que pide una decisión informada. Dice las tres
 * cosas que hacen falta y ninguna más — qué hace, qué no pasa, y qué se pierde
 * de verdad — sin dramatizar ni quitarle importancia.
 */
export function RiskDialog({
  open, onAccept, onCancel,
}: { open: boolean; onAccept: () => void; onCancel: () => void }) {
  const t = useT();
  return (
    <Modal
      open={open}
      title={t('tro.avisoTitulo')}
      icon={<ShieldAlert size={18} className="text-warn" />}
      onClose={onCancel}
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('tro.avisoMejorNo')}</Button>
        <Button variant="primary" onClick={onAccept}>{t('tro.avisoContinuar')}</Button>
      </>}
    >
      <p className="text-[13px] leading-6">{t('aviso.entradilla')}</p>

      <div className="mt-4 flex flex-col gap-3">
        <Point tone="ok" title={t('tro.avisoNoBaneable')}>
          {t('aviso.noBaneableCuerpo')}
        </Point>

        <Point tone="warn" title={t('tro.avisoArruina')}>
          {t('aviso.arruinaCuerpo')}
        </Point>

        <Point tone="warn" title={t('tro.avisoSinVuelta')}>
          {t('aviso.sinVueltaCuerpo')}
        </Point>
      </div>

      {/* La salida va partida en dos claves con el enlace en medio: una sola
          cadena con etiquetas dentro obligaría a traducir HTML, y eso es
          justo donde una traducción rompe la interfaz. */}
      <p className="mt-4 rounded-sm border border-line bg-inset px-3 py-2.5 text-[12px] leading-5 text-muted">
        {t('aviso.salidaAntes')}
        <strong className="text-fg">{t('tro.avisoJugandoFuerte')}</strong>
        {t('aviso.salidaDespues')}
      </p>

      <p className="mt-3 text-[11px] leading-5 text-faint">{t('aviso.soloUnaVez')}</p>
    </Modal>
  );
}

export function Point({
  tone, title, children,
}: { tone: 'ok' | 'warn'; title: string; children: React.ReactNode }) {
  return (
    <div className={cn(
      'rounded-sm border-l-2 pl-3',
      tone === 'ok' ? 'border-[var(--success-line)]' : 'border-[var(--warn-line)]',
    )}>
      <p className={cn('text-[13px] font-semibold', tone === 'ok' ? 'text-success' : 'text-warn')}>
        {title}
      </p>
      <p className="mt-0.5 text-[12px] leading-5 text-muted">{children}</p>
    </div>
  );
}
