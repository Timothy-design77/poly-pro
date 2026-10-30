import type { SessionRecord } from '../../store/db';
import type { ProjectRecord as Project } from '../../store/db';
import { TakeComparison } from '../progress/TakeComparison';
import { HelpTip } from '../ui/HelpTip';
import { getPracticeStreak } from '../../utils/practice-streak';
import { scoreTone } from './TakeRow';

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins === 0) return `${totalSec}s`;
  return `${mins}m`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-bg-primary px-3 py-2">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

/** Comparison, score trend, practice days and project tempo for the filtered takes. */
export function PracticeProgress({ sessions, project }: { sessions: SessionRecord[]; project: Project | null }) {
  const scored = sessions.filter((session) => session.analyzed && (session.totalScored ?? session.totalHits) >= 8);
  const recent = scored.slice(0, 20).reverse();
  const best = scored.reduce((max, session) => Math.max(max, session.score ?? 0), 0);
  const totalTime = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const streak = getPracticeStreak(sessions.map((session) => session.date));

  const days = Array.from({ length: 28 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (27 - i));
    const key = day.toDateString();
    return { day, count: sessions.filter((session) => new Date(session.date).toDateString() === key).length };
  });
  const activeDays = days.filter((d) => d.count > 0).length;

  const bpmProgress = project
    ? project.goalBpm === project.startBpm ? 100 : Math.min(100, Math.max(0, ((project.currentBpm - project.startBpm) / (project.goalBpm - project.startBpm)) * 100))
    : 0;

  return (
    <div className="space-y-5">
      <TakeComparison sessions={sessions} />

      <section aria-labelledby="progress-scores" className="space-y-2">
        <h3 id="progress-scores" className="text-sm font-semibold text-text-primary">Recent scores</h3>
        {recent.length > 0 ? (
          <div role="img" aria-label={`Last ${recent.length} scored takes, oldest to newest: ${recent.map((s) => `${Math.round(s.score ?? 0)}%`).join(', ')}`}
            className="flex h-28 items-end gap-[3px] rounded-xl bg-bg-primary p-2">
            {recent.map((session) => {
              const score = session.score ?? 0;
              return <div key={session.id} className={`flex-1 rounded-t-sm bg-current ${scoreTone(score)}`} style={{ height: `${Math.max(4, score)}%`, opacity: 0.7 }} />;
            })}
          </div>
        ) : <p className="text-sm text-text-secondary">Analyze a take with at least 8 hits to see scores here.</p>}
      </section>

      <section aria-labelledby="progress-days" className="space-y-2">
        <h3 id="progress-days" className="text-sm font-semibold text-text-primary">Practice days</h3>
        <div className="grid gap-3 min-[380px]:grid-cols-2">
          <div role="img" aria-label={`Practiced on ${activeDays} of the last 28 days`} className="grid w-full max-w-[220px] grid-cols-7 content-start gap-[3px]">
            {days.map(({ day, count }) => (
              <div key={day.toDateString()} title={`${day.toLocaleDateString()}: ${count} take${count === 1 ? '' : 's'}`}
                className={`aspect-square rounded-[3px] ${count === 0 ? 'bg-bg-raised' : 'bg-success'}`}
                style={count === 0 ? undefined : { opacity: count === 1 ? 0.35 : count <= 3 ? 0.6 : 1 }} />
            ))}
          </div>
          <dl className="grid grid-cols-2 content-start gap-2">
            <Stat label="Time" value={totalTime > 0 ? formatDuration(totalTime) : '—'} />
            <Stat label="Takes" value={String(sessions.length)} />
            <Stat label="Best" value={best > 0 ? `${Math.round(best)}%` : '—'} />
            <Stat label="Streak" value={`${streak} day${streak === 1 ? '' : 's'}`} />
          </dl>
        </div>
      </section>

      {project && (
        <section aria-labelledby="progress-tempo" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 id="progress-tempo" className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              Project tempo
              <HelpTip text="Your current practice tempo toward the project goal. It advances when you pass the project's accuracy target often enough." />
            </h3>
            <span className="text-sm tabular-nums text-text-secondary">{project.currentBpm} of {project.goalBpm} BPM</span>
          </div>
          <div role="progressbar" aria-label="Project tempo progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bpmProgress)} className="h-2 overflow-hidden rounded-full bg-bg-raised">
            <div className="h-full rounded-full bg-accent" style={{ width: `${bpmProgress}%` }} />
          </div>
        </section>
      )}
    </div>
  );
}
