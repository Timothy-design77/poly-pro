/**
 * ScoreTab — default tab in session detail.
 *
 * Score hero, σ badge, metadata, tappable headlines (→ chart tab),
 * stats grid (with drift), "How was this computed?" breakdown.
 */

import { useState } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  /** Callback to switch to charts tab and open a specific section */
  onNavigateChart?: (chartId: string) => void;
}

export function ScoreTab({ session, hitEvents: _hitEvents, onNavigateChart }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (!session.analyzed) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2">
        <p className="text-text-muted text-sm">This session hasn't been analyzed</p>
        <p className="text-text-muted text-xs">Record a new session to see detailed scores</p>
      </div>
    );
  }

  const score = session.score ?? 0;
  const sigma = session.sigma ?? 0;
  const sigmaLevel = session.sigmaLevel ?? 'Beginner';
  const rawHeadlines = session.headlines ?? [];
  // Normalize headlines: handle both old string[] and new HeadlineItem[] format
  const headlines = rawHeadlines.map((h) =>
    typeof h === 'string' ? { text: h } : h
  );
  const meanOffset = session.meanOffset ?? 0;
  const hitRate = session.hitRate ?? 0;
  const perfectPct = session.perfectPct ?? 0;
  const goodPct = session.goodPct ?? 0;
  const fatigueRatio = session.fatigueRatio ?? 1;
  const maxDrift = session.maxDrift ?? 0;
  const totalScored = session.totalScored ?? session.totalHits;
  const totalExpected = session.totalExpected ?? 0;
  const scoringWindowMs = session.scoringWindowMs ?? 0;
  const flamMergeMs = session.flamMergeMs ?? 0;

  const scoreColor = score >= 85 ? '#4ADE80' : score >= 70 ? '#FBBF24' : '#F87171';

  const durationMin = Math.floor(session.durationMs / 60000);
  const durationSec = Math.floor((session.durationMs / 1000) % 60);

  return (
    <div className="space-y-4">
      {/* Score hero */}
      <div className="flex flex-col items-center py-4">
        <div className="flex items-center gap-2">
          <span
            className="text-5xl font-bold font-mono"
            style={{ color: scoreColor }}
          >
            {Math.round(score)}%
          </span>
          <HelpTip text="Overall score based on timing consistency (σ). Higher = tighter timing. Hit rate, mean offset, and calibration bonuses also factor in." />
        </div>

        {/* σ badge */}
        <div
          className="mt-2 px-3 py-1 rounded-full flex items-center gap-1.5"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
        >
          <span className="text-xs font-mono text-text-secondary">
            σ {sigma.toFixed(1)}ms
          </span>
          <span className="text-xs text-text-muted">{sigmaLevel}</span>
          <HelpTip text="σ (sigma) measures how consistent your timing is — the spread of your hit deviations. Professional: ≤10ms, Advanced: ≤20ms, Intermediate: ≤35ms, Developing: ≤50ms." />
        </div>
      </div>

      {/* Session metadata */}
      <div className="flex items-center justify-center gap-4">
        <MetaItem label="BPM" value={String(session.bpm)} />
        <MetaItem label="Meter" value={session.meter} />
        <MetaItem label="Hits" value={`${totalScored}/${totalExpected}`} />
        <MetaItem label="Duration" value={`${durationMin}:${String(durationSec).padStart(2, '0')}`} />
      </div>

      {/* Tappable headlines → jump to chart */}
      {headlines.length > 0 && (
        <div className="space-y-1.5">
          {headlines.map((h, i) => (
            <button
              key={i}
              onClick={() => h.link && onNavigateChart?.(h.link)}
              className={`w-full text-left bg-bg-surface rounded-lg border border-border-subtle px-3 py-2
                ${h.link ? 'active:bg-bg-raised touch-manipulation' : ''}`}
            >
              <p className="text-xs text-text-secondary">
                {h.text}
                {h.link && (
                  <span className="text-text-muted ml-1">→</span>
                )}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Stats grid */}
      <div className="bg-bg-surface rounded-xl border border-border-subtle p-3">
        <div className="grid grid-cols-2 gap-2">
          <StatRow label="Mean Offset" value={`${meanOffset > 0 ? '+' : ''}${meanOffset.toFixed(1)}ms`}
            sub={Math.abs(meanOffset) < 5 ? 'centered' : meanOffset > 0 ? 'late' : 'early'}
            help="Average timing deviation from the beat grid. Positive = late, negative = early." />
          <StatRow label="Hit Rate" value={`${Math.round(hitRate * 100)}%`}
            help="Percentage of expected beats where a hit was detected within the scoring window." />
          <StatRow label="Perfect" value={`${Math.round(perfectPct)}%`}
            sub={`within ±${scoringWindowMs.toFixed(0)}ms`}
            help="Percentage of your scored hits that landed within the scoring window." />
          <StatRow label="Good" value={`${Math.round(goodPct)}%`}
            sub={`within ±${(scoringWindowMs * 1.5).toFixed(0)}ms`}
            help="Percentage of scored hits within 1.5× the scoring window." />
          <StatRow label="Fatigue" value={fatigueRatio.toFixed(2) + '×'}
            sub={fatigueRatio > 1.4 ? 'timing degraded' : fatigueRatio < 0.8 ? 'improved' : 'stable'}
            help="Compares your timing in the last quarter vs first quarter. >1.0× means timing got looser." />
          <StatRow label="Max Drift" value={`${maxDrift > 0 ? '+' : ''}${maxDrift.toFixed(1)}ms`}
            sub={Math.abs(maxDrift) < 10 ? 'minimal' : maxDrift > 0 ? 'drifted late' : 'drifted early'}
            help="Largest smoothed timing drift during the session. Shows if you gradually speed up or slow down." />
          <StatRow label="Consistency" value={`σ ${sigma.toFixed(1)}ms`}
            help="Standard deviation of timing deviations — the primary metric. Lower is better." />
        </div>
      </div>

      {/* How was this computed? */}
      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        className="text-xs text-text-muted underline touch-manipulation"
      >
        {showBreakdown ? 'Hide score breakdown' : 'How was this computed?'}
      </button>

      {showBreakdown && (
        <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 space-y-2 text-xs text-text-secondary">
          <p>
            <span className="text-text-muted">Base score from σ:</span>{' '}
            σ = {sigma.toFixed(1)}ms → base ≈ {computeBaseDisplay(sigma)}
          </p>
          <p>
            <span className="text-text-muted">Hit rate modifier:</span>{' '}
            × {(hitRate).toFixed(2)} ({Math.round(hitRate * 100)}% hit rate)
          </p>
          {Math.abs(meanOffset) < 5 && totalScored > 10 && (
            <p>
              <span className="text-text-muted">NMA bonus:</span> +2 (mean offset &lt; 5ms)
            </p>
          )}
          <p>
            <span className="text-text-muted">Final:</span>{' '}
            <span className="font-mono font-bold" style={{ color: scoreColor }}>{Math.round(score)}%</span>
          </p>
          <hr className="border-border-subtle" />
          <p className="text-text-muted leading-relaxed">
            Scoring window: ±{scoringWindowMs.toFixed(1)}ms (tempo-scaled).
            Flam merge: {flamMergeMs.toFixed(1)}ms.
            σ (standard deviation) measures timing consistency — being
            consistently early or late doesn&apos;t hurt your σ.
          </p>
        </div>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className="text-xs font-mono font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function StatRow({ label, value, sub, help }: { label: string; value: string; sub?: string; help?: string }) {
  return (
    <div className="px-2 py-1.5">
      <p className="text-[10px] text-text-muted flex items-center gap-1">
        {label}
        {help && <HelpTip text={help} />}
      </p>
      <p className="text-sm font-mono font-semibold text-text-primary">{value}</p>
      {sub && <p className="text-[9px] text-text-muted">{sub}</p>}
    </div>
  );
}

function computeBaseDisplay(sigma: number): string {
  let base: number;
  if (sigma <= 10) base = 95 + (10 - sigma) * 0.5;
  else if (sigma <= 20) base = 80 + (20 - sigma) * 1.5;
  else if (sigma <= 35) base = 60 + (35 - sigma) * 1.33;
  else if (sigma <= 50) base = 40 + (50 - sigma) * 1.33;
  else base = Math.max(10, 40 - (sigma - 50));
  return Math.round(base) + '%';
}
