import { useEffect } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Sidebar } from '@/components/Sidebar';
import { Toaster } from '@/components/Toaster';
import { PlatinumCelebration } from '@/components/PlatinumCelebration';
import { LibraryView } from '@/views/LibraryView';
import { AchievementsView } from '@/views/AchievementsView';
import { ModsView } from '@/views/ModsView';
import { SettingsView } from '@/views/SettingsView';
import { GuidesView } from '@/views/GuidesView';
import { MapsView } from '@/views/MapsView';
import { GameView } from '@/views/GameView';
import { ActivityView } from '@/views/ActivityView';
import { hayModalAbierto } from '@/components/ui';
import { useStore, wireEvents } from '@/store';

export default function App() {
  const section = useStore((s) => s.section);
  const selectedGame = useStore((s) => s.selected());
  const loadLibrary = useStore((s) => s.loadLibrary);
  const loadSettings = useStore((s) => s.loadSettings);
  const go = useStore((s) => s.go);
  const scan = useStore((s) => s.scan);
  const celebration = useStore((s) => s.celebration);
  const celebrate = useStore((s) => s.celebrate);

  useEffect(() => {
    const unwire = wireEvents();
    void loadSettings();
    void loadLibrary();
    return unwire;
  }, [loadLibrary, loadSettings]);

  // Atajos que no interfieren con formularios ni con el lector de pantalla.
  // Ctrl+K lleva al buscador; R actualiza la biblioteca solo estando en ella;
  // Escape regresa a la ficha del juego seleccionado.
  useEffect(() => {
    const isWriting = (target: EventTarget | null) => target instanceof HTMLElement && (
      target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
    );
    const onKeyDown = (event: KeyboardEvent) => {
      // Un diálogo abierto se queda con el teclado: navegar por detrás de él
      // dejaría el modal flotando sobre una vista que no es la suya.
      if (hayModalAbierto() || isWriting(event.target)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        go('library');
        requestAnimationFrame(() => document.getElementById('library-search')?.focus());
      } else if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && section === 'library') {
        event.preventDefault();
        void scan();
      } else if (event.key === 'Escape' && selectedGame) {
        go(section === 'game' ? 'library' : 'game');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [go, scan, section, selectedGame]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-base">
      {selectedGame?.headerUrl && (
        <div
          aria-hidden="true"
          className="gpu-layer pointer-events-none absolute inset-0 scale-105 bg-cover bg-center opacity-20 blur-2xl transition-opacity duration-500 will-change-transform"
          style={{ backgroundImage: `url("${selectedGame.headerUrl}")` }}
        />
      )}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-base/85 backdrop-blur-[2px]" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div key={`${section}-${selectedGame?.id ?? 'none'}`} className="flex min-h-0 flex-1 flex-col animate-view">
              {section === 'library' && <LibraryView />}
              {section === 'activity' && <ActivityView />}
              {section === 'game' && <GameView />}
              {section === 'achievements' && <AchievementsView />}
              {section === 'guides' && <GuidesView />}
              {section === 'maps' && <MapsView />}
              {section === 'mods' && <ModsView />}
              {section === 'settings' && <SettingsView />}
            </div>
          </main>
        </div>
        <Toaster />
      </div>
      {/* Va fuera de la capa z-10 y por encima de todo: es lo único de la
          aplicación que merece tapar el resto. */}
      {celebration && (
        <PlatinumCelebration report={celebration} onClose={() => celebrate(null)} />
      )}
    </div>
  );
}
