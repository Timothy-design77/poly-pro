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
import * as db from './store/db';

export function App() {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const loadProjects = useProjectStore((s) => s.loadFromDB);
  const loadSessions = useSessionStore((s) => s.loadFromDB);
  const loadInstruments = useInstrumentStore((s) => s.loadFromDB);

  useEffect(() => {
    let cancelled = false;
    let delayedRecoveryTimer: number | null = null;
    setReady(false);
    setLoadError(null);

    (async () => {
      try {
        const recovered = await db.recoverOrphanedRecordings();
        await db.cleanupIncompleteRecordings();
        await Promise.all([loadProjects(), loadSessions(), loadInstruments(), hydrateStores()]);
        if (cancelled) return;
        setRecoveredCount(recovered);
        startPersistence();
        setReady(true);
        navigator.storage?.persist?.().catch(() => {});
        delayedRecoveryTimer = window.setTimeout(async () => {
          try {
            const additional = await db.recoverOrphanedRecordings();
            if (!cancelled && additional > 0) {
              setRecoveredCount((count) => count + additional);
              await loadSessions();
            }
          } catch (error) {
            console.warn('Delayed recording recovery failed:', error);
          }
        }, 12_000);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load Poly Pro data:', error);
        setLoadError(error instanceof Error ? error.message : 'Unable to open local storage.');
      }
    })();

    return () => { cancelled = true; if (delayedRecoveryTimer !== null) window.clearTimeout(delayedRecoveryTimer); };
  }, [loadProjects, loadSessions, loadInstruments, loadAttempt]);

  if (loadError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center bg-bg-primary">
        <h1 className="text-lg font-semibold text-text-primary">Local data is temporarily unavailable</h1>
        <p className="text-sm text-text-secondary max-w-sm">{loadError}</p>
        <p className="text-xs text-text-muted max-w-sm">Poly Pro will not delete the database automatically. Your existing data is left untouched.</p>
        <button type="button" className="min-h-[44px] px-5 rounded-xl bg-accent text-bg-primary text-sm font-semibold" onClick={() => { db.resetDBConnection(); setLoadAttempt((value) => value + 1); }}>
          Retry storage
        </button>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.85)] animate-splash-pulse" />
          <span className="text-lg font-bold tracking-wide text-text-primary">Poly Pro</span>
        </div>
        <span className="text-[11px] text-text-muted tracking-wider uppercase">Loading your setup</span>
      </div>
    );
  }

  return (
    <div className="h-full animate-app-enter">
      <UpdateBanner />
      {recoveredCount > 0 && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-warning/95 px-4 py-2 text-center" role="status">
          <p className="text-bg-primary text-xs font-semibold">Recovered {recoveredCount} interrupted recording{recoveredCount === 1 ? '' : 's'} from durable storage.</p>
        </div>
      )}
      <SwipeNavigation
        pages={[<ProjectsPage />, <HomePage />, <ProgressPage />]}
        pageLabels={['Projects', 'Home', 'Progress']}
        initialPage={1}
        settingsContent={<SettingsContent />}
      />
    </div>
  );
}
