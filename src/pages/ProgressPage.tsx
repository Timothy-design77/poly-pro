import { useState, useCallback } from 'react';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { usePlayback } from '../hooks/usePlayback';
import { SessionDetailPage } from './SessionDetailPage';
import type { SessionRecord } from '../store/db';
import { HelpTip } from '../components/ui/HelpTip';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ProgressPage() {
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [visibleSessions, setVisibleSessions] = useState(20);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) =>
    s.projects.find((project) => project.id === s.activeProjectId) || null
  );
  const allSessions = useSessionStore((s) => s.sessions);
  const sessions = allSessions.filter((session) => session.projectId === activeProjectId);
  const { playingSessionId, play } = usePlayback();
  const loadSessions = useSessionStore((s) => s.loadFromDB);

  const handleDeleteSession = useCallback(async () => {
    setSelectedSession(null);
    await loadSessions();
  }, [loadSessions]);

  const totalTime = sessions.reduce((acc, session) => acc + session.durationMs, 0);
  const bestPct = sessions.length > 0
    ? Math.max(...sessions.map((session) => session.analyzed ? (session.score ?? session.perfectPct) : session.perfectPct))
    : 0;

  const streak = (() => {
    if (sessions.length === 0) return 0;
    const days = new Set(sessions.map((session) => new Date(session.date).toDateString()));
    let count = 0;
    const day = new Date();
    while (days.has(day.toDateString())) {
      count++;
      day.setDate(day.getDate() - 1);
    }
    return count;
  })();

  const heatmapData = (() => {
    const cells: number[] = [];
    const today = new Date();
    for (let i = 27; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toDateString();
      cells.push(sessions.filter((session) => new Date(session.date).toDateString() === dayStr).length);
    }
    return cells;
  })();

  const bpmProgress = activeProject
    ? activeProject.goalBpm === activeProject.startBpm
      ? 100
      : Math.min(100, Math.max(0,
          ((activeProject.currentBpm - activeProject.startBpm) /
          (activeProject.goalBpm - activeProject.startBpm)) * 100
        ))
    : 0;

  return (
    <div className="h-full flex flex-col px-4 py-4 overflow-y-auto bg-bg-primary">
      <div className="w-full max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-4 shrink-0">
          <span className="text-base">{activeProject?.icon || '⚡'}</span>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              {activeProject?.name || 'Quick Start'}
            </p>
            <p className="text-[11px] text-text-muted font-mono">
              {activeProject
                ? `${activeProject.startBpm} → ${activeProject.goalBpm} BPM`
                : 'Untracked practice sessions'}
            </p>
          </div>
        </div>

        <div className="bg-bg-surface rounded-xl border border-border-subtle p-4 mb-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-text-secondary">Score</span>
          </div>
          {sessions.length > 0 ? (
            <div className="h-32 flex items-end gap-[2px]" aria-label="Recent session scores">
              {sessions.slice(0, 20).reverse().map((session) => {
                const score = session.analyzed ? (session.score ?? 0) : session.perfectPct;
                return (
                  <div
                    key={session.id}
                    className="flex-1 rounded-t"
                    title={`${Math.round(score)}%`}
                    style={{
                      height: `${Math.max(4, score)}%`,
                      backgroundColor: score >= 85
                        ? 'rgba(24,122,59,0.65)'
                        : score >= 70
                          ? 'rgba(164,81,8,0.60)'
                          : 'rgba(180,35,44,0.55)',
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="h-32 flex items-end justify-center">
              <p className="text-text-muted text-xs text-center leading-relaxed">
                Complete a recorded session<br />to see your stats
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 mb-3 shrink-0">
          <div className="flex-1 bg-bg-surface rounded-xl border border-border-subtle p-3">
            <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
              Consistency
            </p>
            <div className="grid grid-cols-7 gap-[2px]">
              {heatmapData.map((count, index) => (
                <div
                  key={index}
                  className="aspect-square rounded-[2px] border border-border-subtle/50"
                  style={{
                    backgroundColor: count === 0
                      ? 'rgba(21,23,26,0.035)'
                      : count === 1
                        ? 'rgba(24,122,59,0.18)'
                        : count <= 3
                          ? 'rgba(24,122,59,0.38)'
                          : 'rgba(24,122,59,0.68)',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5">
            {[
              { label: 'Total Time', value: totalTime > 0 ? formatDuration(totalTime) : '—' },
              { label: 'Sessions', value: String(sessions.length) },
              { label: 'Best', value: bestPct > 0 ? `${Math.round(bestPct)}%` : '—' },
              { label: 'Streak', value: streak > 0 ? `${streak} day${streak > 1 ? 's' : ''}` : '0 days' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-bg-surface rounded-lg border border-border-subtle px-2.5 py-1.5">
                <p className="text-[9px] text-text-muted font-medium">{label}</p>
                <p className="text-sm font-mono font-semibold text-text-primary">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {activeProject && (
          <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 mb-3 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-text-muted font-medium flex items-center gap-1">
                BPM Progress
                <HelpTip text="Tracks your current BPM toward your project goal. Advances automatically when you consistently pass accuracy targets." />
              </span>
              <span className="text-[11px] font-mono text-text-secondary">
                {activeProject.currentBpm} / {activeProject.goalBpm}
              </span>
            </div>
            <div className="h-2 bg-bg-raised rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${bpmProgress}%` }}
              />
            </div>
          </div>
        )}

        <div>
          <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">
            Sessions ({sessions.length})
          </h3>
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center py-6 bg-bg-surface rounded-xl border border-border-subtle">
              <p className="text-xs text-text-muted">
                {activeProject ? 'No sessions in this project yet' : 'No Quick Start sessions yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sessions.slice(0, visibleSessions).map((session) => {
                const isPlaying = playingSessionId === session.id;
                const score = session.analyzed ? (session.score ?? 0) : session.perfectPct;
                const sigmaLabel = session.analyzed && session.sigmaLevel ? session.sigmaLevel : null;
                const sigma = session.analyzed && session.sigma !== undefined ? session.sigma : null;
                const firstHeadline = session.analyzed && session.headlines?.length ? session.headlines[0] : null;
                const headline = typeof firstHeadline === 'string' ? firstHeadline : firstHeadline?.text ?? null;

                return (
                  <div
                    key={session.id}
                    className="bg-bg-surface rounded-lg border border-border-subtle px-3 py-2.5
                               touch-manipulation active:bg-bg-raised cursor-pointer"
                    onClick={() => setSelectedSession(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSession(session);
                      }
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {session.hasRecording && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); play(session.id); }}
                          className={`w-[40px] h-[40px] rounded-lg flex items-center justify-center
                                      shrink-0 touch-manipulation border border-border-subtle
                            ${isPlaying
                              ? 'bg-accent text-bg-primary'
                              : 'bg-bg-raised text-text-primary active:bg-accent-dim'}`}
                          aria-label={isPlaying ? 'Pause recording playback' : 'Play recording'}
                        >
                          {isPlaying ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="5" y="4" width="5" height="16" rx="1" />
                              <rect x="14" y="4" width="5" height="16" rx="1" />
                            </svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="6 3 20 12 6 21" />
                            </svg>
                          )}
                        </button>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-secondary">{formatDate(session.date)}</span>
                          <span className="font-mono text-xs text-text-primary font-bold">{session.bpm} BPM</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-text-muted">{session.meter}</span>
                          <span className="text-[10px] text-text-muted">
                            {session.analyzed ? (session.totalScored ?? session.totalHits) : session.totalHits} hits
                          </span>
                          {sigma !== null && (
                            <span className="text-[10px] font-mono text-text-muted">σ {sigma.toFixed(1)}ms</span>
                          )}
                          {session.durationMs > 0 && (
                            <span className="text-[10px] text-text-muted">
                              {Math.floor(session.durationMs / 60000)}:{String(Math.floor((session.durationMs / 1000) % 60)).padStart(2, '0')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end shrink-0">
                        <span className={`font-mono text-xs font-bold
                          ${score >= 85 ? 'text-success'
                            : score >= 70 ? 'text-warning'
                            : 'text-danger'}`}
                        >
                          {Math.round(score)}%
                        </span>
                        {sigmaLabel && (
                          <span className="text-[9px] text-text-muted">{sigmaLabel}</span>
                        )}
                      </div>
                    </div>
                    {headline && (
                      <p className="text-[10px] text-text-muted mt-1 ml-[52px] truncate">{headline}</p>
                    )}
                  </div>
                );
              })}

              {sessions.length > visibleSessions && (
                <button
                  type="button"
                  onClick={() => setVisibleSessions((visible) => visible + 20)}
                  className="w-full min-h-[44px] py-2.5 text-text-secondary text-xs font-semibold active:bg-bg-raised rounded-lg"
                >
                  Show more ({sessions.length - visibleSessions} remaining)
                </button>
              )}
            </div>
          )}
        </div>

        <div className="h-6 shrink-0" />
      </div>

      <SessionDetailPage
        session={selectedSession}
        visible={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
        onDelete={handleDeleteSession}
      />
    </div>
  );
}
