import { useEffect } from 'react';
import { TitleBar } from '@/components/TitleBar';
import { Sidebar } from '@/components/Sidebar';
import { Toaster } from '@/components/Toaster';
import { LibraryView } from '@/views/LibraryView';
import { AchievementsView } from '@/views/AchievementsView';
import { CheatsView } from '@/views/CheatsView';
import { ScannerView } from '@/views/ScannerView';
import { ModsView } from '@/views/ModsView';
import { SettingsView } from '@/views/SettingsView';
import { useStore, wireEvents } from '@/store';

export default function App() {
  const section = useStore((s) => s.section);
  const loadLibrary = useStore((s) => s.loadLibrary);
  const loadSettings = useStore((s) => s.loadSettings);

  useEffect(() => {
    const unwire = wireEvents();
    void loadSettings();
    void loadLibrary();
    return unwire;
  }, [loadLibrary, loadSettings]);

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {section === 'library' && <LibraryView />}
          {section === 'achievements' && <AchievementsView />}
          {section === 'cheats' && <CheatsView />}
          {section === 'scanner' && <ScannerView />}
          {section === 'mods' && <ModsView />}
          {section === 'settings' && <SettingsView />}
        </main>
      </div>
      <Toaster />
    </div>
  );
}
