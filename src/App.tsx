import { useEffect, useState } from 'react';
import { SwipeNavigation } from './components/ui/SwipeNavigation';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsContent } from './components/settings/SettingsOverlay';
import { useProjectStore } from './store/project-store';
import { useSessionStore } from './store/session-store';
import { hydrateStores, startPersistence } from './store/persistence';

export function App() {
  const [ready, setReady] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadFromDB);
  const loadSessions = useSessionStore((s) => s.loadFromDB);

  useEffect(() => {
    const init = () =>
      Promise.all([loadProjects(), loadSessions(), hydrateStores()])
        .then(() => {
          startPersistence();
          setReady(true);
        });

    init().catch((err) => {
      console.warn('First init attempt failed, retrying in 1s:', err);
      // Retry once — the blocked upgrade may have resolved after old SW died
      setTimeout(() => {
        init().catch((err2) => {
          console.error('Init retry failed:', err2);
          setReady(true); // Load anyway with defaults
        });
      }, 1000);
    });
  }, [loadProjects, loadSessions]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
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
  );
}
