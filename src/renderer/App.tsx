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
import { useStore, wireEvents } from '@/store';

export default function App() {
  const section = useStore((s) => s.section);
  const selectedGame = useStore((s) => s.selected());
  const loadLibrary = useStore((s) => s.loadLibrary);
  const loadSettings = useStore((s) => s.loadSettings);
  const celebration = useStore((s) => s.celebration);
  const celebrate = useStore((s) => s.celebrate);

  useEffect(() => {
    const unwire = wireEvents();
    void loadSettings();
    void loadLibrary();
    return unwire;
  }, [loadLibrary, loadSettings]);

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
