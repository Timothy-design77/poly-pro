import { useState } from 'react';
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
  const activeProject = useProjectStore((s) => {
    return s.projects.find((p) => p.id === s.activeProjectId) || null;
  });
  const sessions = useSessionStore((s) =>
    activeProject ? s.getSessionsForProject(activeProject.id) : []
  );
  const { playingSessionId, play } = usePlayback();

  const totalTime = sessions.reduce((acc, s) => acc + s.durationMs, 0);
  const bestPct = sessions.length > 0
    ? Math.max(...sessions.map((s) => s.analyzed ? (s.score ?? s.perfectPct) : s.perfectPct))
    : 0;

  // Streak: consecutive days with sessions
  const streak = (() => {
    if (sessions.length === 0) return 0;
    const days = new Set(sessions.map((s) => new Date(s.date).toDateString()));
    let count = 0;
    const d = new Date();
    while (days.has(d.toDateString())) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  })();

  // Heatmap: last 28 days
  const heatmapData = (() => {
    const cells: number[] = [];
    const today = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayStr = d.toDateString();
      const count = sessions.filter((s) => new Date(s.date).toDateString() === dayStr).length;
      cells.push(count);
    }
    return cells;
  })();

  // BPM progress
  const bpmProgress = activeProject
    ? Math.min(100, Math.max(0,
        ((activeProject.currentBpm - activeProject.startBpm) /
        (activeProject.goalBpm - activeProject.startBpm)) * 100
      ))
    : 0;

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center px-4">
        <p className="text-text-muted text-sm text-center">No active project</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col px-4 py-4 overflow-y-auto">
      {/* Project identity */}
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <span className="text-base">{activeProject.icon}</span>
        <div>
          <p className="text-sm font-semibold text-text-primary">{activeProject.name}</p>
          <p className="text-[11px] text-text-muted font-mono">
            {activeProject.startBpm} → {activeProject.goalBpm} BPM
          </p>
        </div>
      </div>

      {/* Hero chart placeholder */}
      <div className="bg-bg-surface rounded-[10px] border border-border-subtle p-4 mb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-text-secondary flex items-center gap-1">
            Score
            <HelpTip text="Bar chart of recent session scores. Green ≥85%, amber ≥70%, red <70%. Based on timing consistency (σ)." />
          </span>
        </div>
        {sessions.length > 0 ? (
          <div className="h-32 flex items-end gap-[2px]">
            {sessions.slice(0, 20).reverse().map((s) => {
              const score = s.analyzed ? (s.score ?? 0) : s.perfectPct;
              return (
                <div
                  key={s.id}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(4, score)}%`,
                    backgroundColor: score >= 85
                      ? 'rgba(74,222,128,0.5)'
                      : score >= 70
                        ? 'rgba(251,191,36,0.5)'
                        : 'rgba(248,113,113,0.4)',
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

      {/* Stats strip */}
      <div className="flex gap-2.5 mb-3 shrink-0">
        {/* Heatmap */}
        <div className="flex-1 bg-bg-surface rounded-[10px] border border-border-subtle p-3">
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2 flex items-center gap-1">
            Consistency
            <HelpTip text="Practice consistency over the last 28 days. Darker green = more sessions that day. Build streaks for steady improvement." />
          </p>
          <div className="grid grid-cols-7 gap-[2px]">
            {heatmapData.map((count, i) => (
              <div
                key={i}
                className="aspect-square rounded-[2px]"
                style={{
                  backgroundColor: count === 0
                    ? 'rgba(255,255,255,0.03)'
                    : count === 1
                      ? 'rgba(74,222,128,0.2)'
                      : count <= 3
                        ? 'rgba(74,222,128,0.4)'
                        : 'rgba(74,222,128,0.7)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Stat rows */}
        <div className="flex-1 flex flex-col gap-1.5">
          {[
            { label: 'Total Time', value: totalTime > 0 ? formatDuration(totalTime) : '—' },
            { label: 'Sessions', value: String(sessions.length) },
            { label: 'Best', value: bestPct > 0 ? `${Math.round(bestPct)}%` : '—' },
            { label: 'Streak', value: streak > 0 ? `${streak} day${streak > 1 ? 's' : ''}` : '0 days' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-bg-surface rounded-[8px] border border-border-subtle px-2.5 py-1.5">
              <p className="text-[9px] text-text-muted font-medium">{label}</p>
              <p className="text-sm font-mono font-semibold text-text-primary">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* BPM progress bar */}
      <div className="bg-bg-surface rounded-[10px] border border-border-subtle p-3 mb-3 shrink-0">
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
            className="h-full rounded-full bg-[rgba(255,255,255,0.2)] transition-all"
            style={{ width: `${bpmProgress}%` }}
          />
        </div>
      </div>

      {/* Sessions list */}
      <div>
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
          Sessions ({sessions.length})
          <HelpTip text="All recorded sessions for this project, newest first. Tap a session to see detailed score, timeline, charts, and tuning controls." />
        </h3>
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-xs text-text-muted">No sessions yet</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((s) => {
              const isPlaying = playingSessionId === s.id;
              const score = s.analyzed ? (s.score ?? 0) : s.perfectPct;
              const sigmaLabel = s.analyzed && s.sigmaLevel ? s.sigmaLevel : null;
              const sigma = s.analyzed && s.sigma !== undefined ? s.sigma : null;
              const headline = s.analyzed && s.headlines?.length
                ? (typeof s.headlines[0] === 'string' ? s.headlines[0] : (s.headlines[0] as any).text)
                : null;
              return (
                <div
                  key={s.id}
                  className="bg-bg-surface rounded-lg border border-border-subtle px-3 py-2.5
                             touch-manipulation active:bg-bg-raised cursor-pointer"
                  onClick={() => setSelectedSession(s)}
                >
                  <div className="flex items-center gap-3">
                    {/* Play button */}
                    {s.hasRecording && (
                      <button
                        onClick={(e) => { e.stopPropagation(); play(s.id); }}
                        className={`w-[36px] h-[36px] rounded-lg flex items-center justify-center
                                    shrink-0 touch-manipulation
                          ${isPlaying
                            ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                            : 'bg-bg-raised text-text-muted active:bg-[rgba(255,255,255,0.08)]'}`}
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
                        <span className="text-xs text-text-secondary">{formatDate(s.date)}</span>
                        <span className="font-mono text-xs text-text-primary font-bold">{s.bpm} BPM</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-text-muted">{s.meter}</span>
                        {s.analyzed ? (
                          <>
                            <span className="text-[10px] text-text-muted">{s.totalScored ?? s.totalHits} hits</span>
                            {sigma !== null && (
                              <span className="text-[10px] font-mono text-text-muted">σ {sigma.toFixed(1)}ms</span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-text-muted">{s.totalHits} hits</span>
                          </>
                        )}
                        {s.durationMs > 0 && (
                          <span className="text-[10px] text-text-muted">
                            {Math.floor(s.durationMs / 60000)}:{String(Math.floor((s.durationMs / 1000) % 60)).padStart(2, '0')}
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
                    <p className="text-[10px] text-text-muted mt-1 ml-[48px] truncate">{headline}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom padding */}
      <div className="h-[60px] shrink-0" />

      {/* Session detail overlay */}
      <SessionDetailPage
        session={selectedSession}
        visible={selectedSession !== null}
        onClose={() => setSelectedSession(null)}
      />
    </div>
  );
}
