import { useEffect, useState } from 'react';
import { SwipeNavigation } from './components/ui/SwipeNavigation';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsContent } from './components/settings/SettingsOverlay';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { useProjectStore } from './store/project-store';
import { useSessionStore } from './store/session-store';
import { useInstrumentStore } from './store/instrument-store';
import { hydrateStores, startPersistence } from './store/persistence';

export function App() {
  const [ready, setReady] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadFromDB);
  const loadSessions = useSessionStore((s) => s.loadFromDB);
  const loadInstruments = useInstrumentStore((s) => s.loadFromDB);

  useEffect(() => {
    // Safety timeout: if DB is blocked (e.g. stale SW holding v2 connection),
    // force the app to load after 5 seconds rather than hang forever.
    const safetyTimer = setTimeout(() => {
      setReady((prev) => {
        if (!prev) console.warn('[app] Startup timeout — forcing load (DB may be blocked)');
        return true;
      });
    }, 5000);

    Promise.all([loadProjects(), loadSessions(), loadInstruments(), hydrateStores()])
      .then(() => {
        clearTimeout(safetyTimer);
        startPersistence();
        setReady(true);
        // Request persistent storage so browser won't evict our data
        navigator.storage?.persist?.().catch(() => {});
      })
      .catch((err) => {
        clearTimeout(safetyTimer);
        console.error('Failed to load data:', err);
        setReady(true);
      });
  }, [loadProjects, loadSessions, loadInstruments]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <UpdateBanner />
      <SwipeNavigation
        pages={[
          <ProjectsPage />,
          <HomePage />,
          <ProgressPage />,
        ]}
        pageLabels={['Projects', 'Home', 'Progress']}
        initialPage={1}
        settingsContent={<SettingsContent />}
      />
    </>
  );
}
