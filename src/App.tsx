import { useEffect, useState } from 'react';
import { SwipeNavigation } from './components/ui/SwipeNavigation';
import { ProjectsPage } from './pages/ProjectsPage';
import { HomePage } from './pages/HomePage';
import { ProgressPage } from './pages/ProgressPage';
import { SettingsContent } from './components/settings/SettingsContent';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { useProjectStore } from './store/project-store';
import { useSessionStore } from './store/session-store';
import { useInstrumentStore } from './store/instrument-store';
import { hydrateStores, startPersistence } from './store/persistence';

export function App() {
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const loadProjects = useProjectStore((state) => state.loadFromDB);
  const loadSessions = useSessionStore((state) => state.loadFromDB);
  const loadInstruments = useInstrumentStore((state) => state.loadFromDB);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      loadProjects(),
      loadSessions(),
      loadInstruments(),
      hydrateStores(),
    ]).then(() => {
      if (cancelled) return;
      startPersistence();
      setReady(true);
      void navigator.storage?.persist?.();
    }).catch((error) => {
      if (cancelled) return;
      console.error('Failed to load local data:', error);
      setStartupError(error instanceof Error
        ? error.message
        : 'Poly Pro could not open local storage.');
    });

    return () => {
      cancelled = true;
    };
  }, [loadProjects, loadSessions, loadInstruments]);

  if (startupError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-12 h-12 rounded-full bg-danger-dim border border-danger/40 flex items-center justify-center text-danger text-xl" aria-hidden="true">
          !
        </div>
        <h1 className="text-lg font-bold text-text-primary">Local storage could not be opened</h1>
        <p className="text-sm text-text-secondary max-w-md leading-relaxed">
          {startupError}
        </p>
        <p className="text-xs text-text-secondary max-w-md leading-relaxed">
          Your data was not deleted. Close other Poly Pro tabs, check available browser storage, and reload.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[44px] px-5 rounded-xl bg-accent text-bg-primary text-sm font-bold
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" role="status" aria-live="polite">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.85)] animate-splash-pulse" aria-hidden="true" />
          <span className="text-lg font-bold tracking-wide text-text-primary">Poly Pro</span>
        </div>
        <span className="text-[11px] text-text-secondary tracking-wider uppercase">
          Loading your setup
        </span>
      </div>
    );
  }

  return (
    <div className="h-full animate-app-enter">
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
    </div>
  );
}
