import { useEffect, useState } from 'react';
import { SwipeNavigation } from './components/ui/SwipeNavigation';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsContent } from './components/settings/SettingsOverlay';
import { useProjectStore } from './store/project-store';
import { useSessionStore } from './store/session-store';

export function App() {
  const [ready, setReady] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadFromDB);
  const loadSessions = useSessionStore((s) => s.loadFromDB);

  useEffect(() => {
    Promise.all([loadProjects(), loadSessions()])
      .then(() => setReady(true))
      .catch((err) => {
        console.error('Failed to load data:', err);
        setReady(true); // continue anyway
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
