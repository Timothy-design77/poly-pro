import { useEffect, useMemo, useState } from 'react';
import type { HitEventsRecord, SessionRecord } from '../../store/db';
import { getHitEvents } from '../../store/db';
import { DEFAULT_ANALYSIS_CONFIG } from '../../analysis/types';
import { rescoreSession } from '../../analysis/reanalysis';

export function TakeComparison({ sessions }: { sessions: SessionRecord[] }) {
  const takes = sessions.filter((session) => session.analyzed && (session.totalScored ?? session.totalHits) >= 8);
  const [chosenA, setChosenA] = useState('');
  const [chosenB, setChosenB] = useState('');
  const a = takes.find((take) => take.id === chosenA) ?? takes[1];
  const b = takes.find((take) => take.id === chosenB) ?? takes[0];
  const [events, setEvents] = useState<{ a: HitEventsRecord; b: HitEventsRecord } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false; setEvents(null); setError(null);
    if (!a || !b) return;
    void Promise.all([getHitEvents(a.id), getHitEvents(b.id)]).then(([first, second]) => {
      if (cancelled) return;
      if (!first || !second) setError('Hit data is missing for one take. Open the take to re-analyze its audio.');
      else setEvents({ a: first, b: second });
    }).catch(() => { if (!cancelled) setError('Could not load comparison data. Reopen Progress to retry.'); });
    return () => { cancelled = true; };
  }, [a?.id, b?.id, a?.analysisRevision, b?.analysisRevision]);

  const comparison = useMemo(() => {
    if (!a || !b || !events) return null;
    const shared = { ...DEFAULT_ANALYSIS_CONFIG, ...b.analysisConfig };
    const score = (take: SessionRecord, hits: HitEventsRecord) => rescoreSession(hits, { ...shared, latencyOffsetMs: take.analysisConfig?.latencyOffsetMs ?? 0 }, take.bpm, Number(take.meter.split('/')[0]), take.subdivision, take.durationMs);
    return { a: score(a, events.a), b: score(b, events.b), window: shared.scoringWindowPct, flam: shared.flamMergePct };
  }, [a, b, events]);
  if (takes.length < 2) return <p className="text-xs text-text-muted mb-3">Record two takes with at least 8 matched hits to compare your timing.</p>;
  const compatible = a.bpm === b.bpm && a.meter === b.meter && a.subdivision === b.subdivision;
  const detectionKeys = ['noiseGate', 'inputGain', 'highPassHz', 'noiseFloorMultiplier', 'minOnsetIntervalMs', 'postHitMaskingMs', 'postHitMaskingStrength', 'fluxThresholdOffset'] as const;
  const sameDetection = !!a.analysisConfig && !!b.analysisConfig && detectionKeys.every((key) => a.analysisConfig?.[key] === b.analysisConfig?.[key]);
  const label = (take: SessionRecord) => `${new Date(take.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${take.bpm} BPM`;
  const delta = (value: number, unit: string) => `${value > 0 ? '+' : ''}${value.toFixed(1)}${unit}`;
  return <section aria-label="Compare takes" className="rounded-xl bg-bg-surface border border-border-subtle p-3 mb-3 space-y-3">
    <h2 className="text-sm font-semibold text-text-primary">Compare takes</h2>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs text-text-secondary">Baseline<select aria-label="Baseline take" value={a.id} onChange={(event) => setChosenA(event.target.value)} className="block w-full min-h-[44px] bg-bg-input border border-border-subtle rounded-lg text-text-primary text-xs p-1">{takes.map((take) => <option key={take.id} value={take.id}>{label(take)}</option>)}</select></label>
      <label className="text-xs text-text-secondary">Compare with<select aria-label="Comparison take" value={b.id} onChange={(event) => setChosenB(event.target.value)} className="block w-full min-h-[44px] bg-bg-input border border-border-subtle rounded-lg text-text-primary text-xs p-1">{takes.map((take) => <option key={take.id} value={take.id}>{label(take)}</option>)}</select></label>
    </div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    {a.id === b.id ? <p className="text-xs text-text-muted">Choose two different takes.</p> : comparison && <>
      <table className="w-full text-xs text-left text-text-primary"><thead><tr className="text-text-muted"><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Comparison</th><th scope="col">Change</th></tr></thead><tbody>
        <tr><th scope="row" className="py-2 font-medium">Score</th><td>{comparison.a.score.toFixed(0)}%</td><td>{comparison.b.score.toFixed(0)}%</td><td>{delta(comparison.b.score - comparison.a.score, ' pts')}</td></tr>
        <tr><th scope="row" className="py-2 font-medium">Timing spread σ</th><td>{comparison.a.sigma.toFixed(1)}ms</td><td>{comparison.b.sigma.toFixed(1)}ms</td><td>{delta(comparison.b.sigma - comparison.a.sigma, 'ms')}</td></tr>
        <tr><th scope="row" className="py-2 font-medium">Hit rate</th><td>{Math.round(comparison.a.hitRate * 100)}%</td><td>{Math.round(comparison.b.hitRate * 100)}%</td><td>{delta((comparison.b.hitRate - comparison.a.hitRate) * 100, ' pts')}</td></tr>
      </tbody></table>
      <p className="text-xs text-text-muted">Preview with the same scoring window ({comparison.window}% IOI) and flam merge ({comparison.flam}%); each take keeps its calibration. Lower σ means tighter timing. Saved scores stay unchanged.</p>
      {(!compatible || !sameDetection) && <p className="text-xs text-warning">{!compatible ? 'Tempo or pattern differs. ' : ''}{!sameDetection ? 'Detection settings differ or are unknown. Re-detect both takes with the same settings for a fair comparison.' : 'Compare the same tempo and pattern to assess improvement.'}</p>}
    </>}
  </section>;
}
