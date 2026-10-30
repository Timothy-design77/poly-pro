import { lazy, Suspense, useState, useCallback } from 'react';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { usePlayback } from '../hooks/usePlayback';
const SessionDetailPage = lazy(() => import('./SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })));
import type { SessionRecord } from '../store/db';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Notice } from '../components/ui/Notice';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import { TakeRow } from '../components/recordings/TakeRow';
import { loadPracticeProgress } from '../utils/prefetch';
const PracticeProgress = lazy(() => loadPracticeProgress().then((module) => ({ default: module.PracticeProgress })));
import { useNavStore, PAGE_HOME } from '../store/nav-store';

export function ProgressPage() {
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [visibleSessions, setVisibleSessions] = useState(20);
  const [projectFilter, setProjectFilter] = useState('all');
  const projects = useProjectStore((s) => s.projects);
  const effectiveFilter = projectFilter === 'all' || projectFilter === 'quick' || projects.some((project) => project.id === projectFilter) ? projectFilter : 'all';
  const activeProject = projects.find((project) => project.id === projectFilter) ?? null;
  const allSessions = useSessionStore((s) => s.sessions);
  const sessions = allSessions.filter((session) => effectiveFilter === 'all' || session.projectId === (effectiveFilter === 'quick' ? null : effectiveFilter));
  const { playingSessionId, play, stop, error: playbackError } = usePlayback();
  const loadSessions = useSessionStore((s) => s.loadFromDB);

  const handleDeleteSession = useCallback(async () => {
    setSelectedSession(null);
    await loadSessions();
  }, [loadSessions]);

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <div className="app-page">
        <PageHeader title="Recordings" />
        <label className="mb-4 flex items-center gap-3">
          <span className="ui-label">Project</span>
          <select aria-label="Filter recordings by project" value={effectiveFilter} onChange={(event) => setProjectFilter(event.target.value)} className="ui-select min-w-0 flex-1">
            <option value="all">All recordings</option><option value="quick">Quick Start</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        {playbackError && <Notice tone="danger" className="mb-3">{playbackError}</Notice>}

        {sessions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 9v6m4-10v14m4-12v10m4-14v18m4-12v6" /></svg></span>
            <h2>{activeProject ? 'No takes in this project' : 'Your practice, recorded'}</h2>
            <p>Record a take to hear it back and explore your timing.</p>
            <Button variant="primary" onClick={() => useNavStore.getState().navigateTo(PAGE_HOME)}>Go to Practice</Button>
          </div>
        ) : (
          <>
            <h2 className="section-heading">{sessions.length} take{sessions.length === 1 ? '' : 's'}</h2>
            <ul className="space-y-2">
              {sessions.slice(0, visibleSessions).map((session) => (
                <TakeRow key={session.id} session={session} playing={playingSessionId === session.id}
                  onTogglePlay={() => play(session.id)} onOpen={() => { stop(); setSelectedSession(session); }} />
              ))}
            </ul>
            {sessions.length > visibleSessions && (
              <Button variant="quiet" block className="mt-2" onClick={() => setVisibleSessions((visible) => visible + 20)}>
                Show {Math.min(20, sessions.length - visibleSessions)} more of {sessions.length - visibleSessions}
              </Button>
            )}
            <div className="settings-list mt-6">
              <CollapsibleCard title="Practice progress">
                <Suspense fallback={<p role="status" className="py-6 text-center text-sm text-text-secondary">Loading…</p>}>
                  <PracticeProgress sessions={sessions} project={activeProject} />
                </Suspense>
              </CollapsibleCard>
            </div>
          </>
        )}
      </div>

      {selectedSession && <Suspense fallback={<p role="status" className="sr-only">Loading take…</p>}><SessionDetailPage
        session={selectedSession}
        visible={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
        onDelete={handleDeleteSession}
      /></Suspense>}
    </div>
  );
}
