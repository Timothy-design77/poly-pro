import type { SessionRecord } from '../../store/db';

export function formatTakeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatClock(ms: number) {
  return `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, '0')}`;
}

export function scoreTone(score: number) {
  return score >= 85 ? 'text-success' : score >= 70 ? 'text-warning' : 'text-danger';
}

/** One take: inline play/pause plus a button that opens Review. */
export function TakeRow({ session, playing, onTogglePlay, onOpen }: {
  session: SessionRecord;
  playing: boolean;
  onTogglePlay: () => void;
  onOpen: () => void;
}) {
  const score = session.analyzed ? (session.score ?? 0) : session.perfectPct;
  const firstHeadline = session.analyzed && session.headlines?.length ? session.headlines[0] : null;
  const headline = typeof firstHeadline === 'string' ? firstHeadline : firstHeadline?.text ?? null;
  const hits = session.analyzed ? (session.totalScored ?? session.totalHits) : session.totalHits;
  const date = formatTakeDate(session.date);

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-bg-surface py-2 pl-2 pr-4">
      {session.hasRecording ? (
        <button
          type="button"
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause recording playback' : 'Play recording'}
          aria-pressed={playing}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border touch-manipulation ${playing ? 'border-accent bg-accent text-[var(--text-on-accent)]' : 'border-border-subtle bg-bg-primary text-text-primary active:bg-bg-raised'}`}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            {playing ? <><rect x="5" y="4" width="5" height="16" rx="1" /><rect x="14" y="4" width="5" height="16" rx="1" /></> : <polygon points="6 3 20 12 6 21" />}
          </svg>
        </button>
      ) : <span className="w-12 shrink-0" aria-hidden="true" />}

      <button type="button" aria-label={`Review take ${date} ${session.bpm} BPM`} onClick={onOpen} className="flex min-h-[56px] min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tabular-nums text-text-primary">{session.bpm} BPM</span>
            <span className="text-xs text-text-secondary">{date}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs tabular-nums text-text-secondary">
            {[session.meter, `${hits} hits`, session.analyzed && session.sigma !== undefined ? `σ ${session.sigma.toFixed(1)} ms` : null, session.durationMs > 0 ? formatClock(session.durationMs) : null].filter(Boolean).join(' · ')}
          </span>
          {headline && <span className="mt-0.5 block truncate text-xs text-text-muted">{headline}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={`text-sm font-semibold tabular-nums ${session.analyzed ? scoreTone(score) : 'text-text-secondary'}`}>
            {session.analyzed ? `${Math.round(score)}%` : 'Needs analysis'}
          </span>
          {session.analyzed && session.sigmaLevel && <span className="text-xs text-text-muted">{session.sigmaLevel}</span>}
        </span>
      </button>
    </li>
  );
}
