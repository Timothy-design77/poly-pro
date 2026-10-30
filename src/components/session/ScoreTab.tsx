/**
 * ScoreTab — default tab in session detail.
 *
 * Score hero, σ badge, metadata, tappable headlines (→ chart tab),
 * stats grid (with drift), "How was this computed?" breakdown.
 */

import { useState, useMemo } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import { getSigmaLevel } from '../../analysis/types';
import { HelpTip } from '../ui/HelpTip';
import { Notice } from '../ui/Notice';
import { computeInstrumentMetrics, computeInterLimbCorrelation } from '../../analysis/classification';
import type { ClassificationResult } from '../../analysis/classification';
import { StatRow, StatSection } from './score/StatRow';
import { InstrumentBreakdown } from './score/InstrumentBreakdown';
import { scoreTone } from '../recordings/TakeRow';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  /** Callback to switch to charts tab and open a specific section */
  onNavigateChart?: (chartId: string) => void;
}

export function ScoreTab({ session, hitEvents, onNavigateChart }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Compute per-instrument metrics from hitEvents
  const { instrumentMetrics, interLimbCorrelations } = useMemo(() => {
    if (!hitEvents?.scoredOnsets) return { instrumentMetrics: [], interLimbCorrelations: [] };

    const hasClassification = hitEvents.scoredOnsets.some((o) => o.instrumentLabel);
    if (!hasClassification) return { instrumentMetrics: [], interLimbCorrelations: [] };

    const scored = hitEvents.scoredOnsets.filter((o) => o.scored);

    const classifications: ClassificationResult[] = scored
      .map((o) => ({
        label: (o.instrumentLabel as ClassificationResult['label']) ?? 'Unknown',
        confidence: o.instrumentConfidence ?? 0,
        topCandidates: (o.instrumentCandidates ?? []) as ClassificationResult['topCandidates'],
      }));

    const deltas = scored.map((o) => o.delta);
    const peaks = scored.map((o) => o.peak);
    const times = scored.map((o) => o.time);

    const metrics = computeInstrumentMetrics(classifications, deltas, peaks);
    const correlations = computeInterLimbCorrelation(classifications, deltas, times);

    return { instrumentMetrics: metrics, interLimbCorrelations: correlations };
  }, [hitEvents]);

  if (!session.analyzed) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-semibold text-text-primary">This take hasn't been analyzed</p>
        <p className="text-sm text-text-secondary">Use Analyze saved recording in Review to get timing feedback.</p>
      </div>
    );
  }

  const score = session.score ?? 0;
  const sigma = session.sigma ?? session.stdDev;
  const sigmaLevel = (session.totalScored ?? session.totalHits) < 8 ? 'Insufficient hits' : session.sigmaLevel ?? getSigmaLevel(sigma);
  const rawHeadlines = session.headlines ?? [];
  // Normalize headlines: handle both old string[] and new HeadlineItem[] format
  const headlines = rawHeadlines.map((h) =>
    typeof h === 'string' ? { text: h } : h
  );
  const meanOffset = session.meanOffset ?? session.avgDelta;
  const perfectPct = session.perfectPct ?? 0;
  const goodPct = session.goodPct ?? 0;
  const fatigueRatio = session.fatigueRatio ?? 1;
  const maxDrift = session.maxDrift ?? 0;
  const totalScored = session.totalScored ?? session.totalHits;
  const totalExpected = session.totalExpected ?? hitEvents?.gridBeats?.length ?? 0;
  const hitRate = session.hitRate ?? (totalExpected ? totalScored / totalExpected : 0);
  const scoringWindowMs = session.scoringWindowMs;
  const flamMergeMs = session.flamMergeMs;

  // Phase 9: Groove
  const swingRatio = session.swingRatio;
  const hasSwing = session.hasSwing;
  const grooveConsistency = session.grooveConsistency;

  // Phase 9: Dynamics
  const accentAdherence = session.accentAdherence;
  const dynamicRange = session.dynamicRange;
  const velocityDecayLabel = session.velocityDecayLabel;

  const tone = scoreTone(score);
  const durationMin = Math.floor(session.durationMs / 60000);
  const durationSec = Math.floor((session.durationMs / 1000) % 60);
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} ms`;

  return (
    <div className="space-y-4">
      {totalScored < 8 && <Notice tone="warning">Fewer than 8 matched hits, so the score and timing spread aren't reliable yet. Check detection in Review or record a longer take.</Notice>}

      <div className="flex flex-col items-center py-3">
        <div className="flex items-center gap-2">
          <span className={`text-5xl font-semibold tabular-nums tracking-tight ${tone}`}>{Math.round(score)}%</span>
          <HelpTip text="Overall score from timing consistency (σ); higher means tighter timing. Hit rate, mean offset and accents also count." />
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-pill bg-accent-dim py-1 pl-3 pr-1 text-sm">
          <span className="tabular-nums text-text-primary">σ {sigma.toFixed(1)} ms</span>
          <span className="text-text-secondary">{sigmaLevel}</span>
          <HelpTip text="σ (sigma) is the spread of your timing around the beat. Professional ≤ 10 ms, advanced ≤ 20 ms, intermediate ≤ 35 ms, developing ≤ 50 ms." />
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-center">
        {[['BPM', String(session.bpm)], ['Meter', session.meter], ['Hits', `${totalScored}/${totalExpected}`], ['Length', `${durationMin}:${String(durationSec).padStart(2, '0')}`]].map(([label, value]) => (
          <div key={label}><dt className="text-xs text-text-secondary">{label}</dt><dd className="text-sm font-semibold tabular-nums text-text-primary">{value}</dd></div>
        ))}
      </dl>

      {headlines.length > 0 && (
        <ul className="space-y-2">
          {headlines.map((h, i) => (
            <li key={i}>
              {h.link ? (
                <button type="button" onClick={() => onNavigateChart?.(h.link!)} className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-left text-sm text-text-primary active:bg-bg-raised">
                  <span>{h.text}</span>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-text-muted"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              ) : <p className="rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-text-primary">{h.text}</p>}
            </li>
          ))}
        </ul>
      )}

      <StatSection title="Timing">
        <StatRow label="Mean offset" value={signed(meanOffset)} sub={Math.abs(meanOffset) < 5 ? 'centered' : meanOffset > 0 ? 'late' : 'early'}
          help="Average distance from the beat. Positive is late, negative is early." />
        <StatRow label="Hit Rate" value={`${Math.round(hitRate * 100)}%`} help="Share of expected beats with a hit inside the scoring window." />
        <StatRow label="Perfect" value={`${Math.round(perfectPct)}%`} sub={scoringWindowMs == null ? 'window unavailable' : `within ±${scoringWindowMs.toFixed(0)} ms`}
          help="Share of scored hits inside the scoring window." />
        <StatRow label="Good" value={`${Math.round(goodPct)}%`} sub={scoringWindowMs == null ? 'window unavailable' : `within ±${(scoringWindowMs * 1.5).toFixed(0)} ms`}
          help="Share of scored hits inside 1.5 times the scoring window." />
        <StatRow label="Fatigue" value={`${fatigueRatio.toFixed(2)}×`} sub={fatigueRatio > 1.4 ? 'timing loosened' : fatigueRatio < 0.8 ? 'improved' : 'stable'}
          help="Timing spread in the last quarter compared with the first. Above 1.0× means timing loosened." />
        <StatRow label="Max drift" value={signed(maxDrift)} sub={Math.abs(maxDrift) < 10 ? 'minimal' : maxDrift > 0 ? 'drifted late' : 'drifted early'}
          help="Largest smoothed drift during the take: whether you gradually rushed or dragged." />
        <StatRow label="Consistency" value={`σ ${sigma.toFixed(1)} ms`} help="Spread of your timing around the beat, the main metric. Lower is better." />
      </StatSection>

      {(swingRatio !== undefined || grooveConsistency != null || accentAdherence != null || dynamicRange != null || velocityDecayLabel) && (
        <StatSection title="Groove and dynamics">
          {swingRatio !== undefined && (hasSwing
            ? <StatRow label="Swing ratio" value={swingRatio.toFixed(2)} sub={swingRatio > 1.5 ? 'heavy swing' : swingRatio > 1.2 ? 'moderate swing' : 'light swing'} help="Long-to-short eighth-note ratio. 1.0 is straight; about 1.67 is standard jazz swing." />
            : <StatRow label="Swing ratio" value="1.0" sub="straight time" help="No swing detected: straight eighth notes." />)}
          {grooveConsistency != null && <StatRow label="Groove lock" value={`r = ${grooveConsistency.toFixed(2)}`} sub={grooveConsistency > 0.7 ? 'locked in' : grooveConsistency > 0.4 ? 'moderate' : 'loose'} help="How repeatable your timing pattern is from measure to measure. Needs at least 16 measures." />}
          {accentAdherence != null && <StatRow label="Accents" value={`${Math.round(accentAdherence * 100)}%`} sub={accentAdherence > 0.7 ? 'clear dynamics' : 'subtle'} help="Share of downbeats played louder than your median hit. Phone microphone gain control can flatten this." />}
          {dynamicRange != null && <StatRow label="Dynamic range" value={`${dynamicRange.toFixed(1)}×`} sub={dynamicRange > 3 ? 'wide' : dynamicRange > 1.5 ? 'moderate' : 'narrow'} help="Ratio between your loudest and softest hits (95th to 5th percentile). Phone microphone gain control can flatten this." />}
          {velocityDecayLabel && <StatRow label="Volume" value={velocityDecayLabel} help="How your hit volume changed over the take." />}
        </StatSection>
      )}

      <InstrumentBreakdown metrics={instrumentMetrics} correlations={interLimbCorrelations} />

      <div>
        <button type="button" aria-expanded={showBreakdown} onClick={() => setShowBreakdown(!showBreakdown)} className="ui-button ui-button-quiet -ml-3 px-3">
          {showBreakdown ? 'Hide score breakdown' : 'How was this computed?'}
        </button>
        {showBreakdown && (
          <div className="ui-surface mt-1 space-y-2 p-4 text-sm text-text-secondary">
            <p>Base score from σ {sigma.toFixed(1)} ms: about {computeBaseDisplay(sigma)}</p>
            <p>Hit rate modifier: × {hitRate.toFixed(2)} ({Math.round(hitRate * 100)}% hit rate)</p>
            {Math.abs(meanOffset) < 5 && totalScored > 10 && <p>Centered timing bonus: +2 (mean offset under 5 ms)</p>}
            {accentAdherence != null && accentAdherence > 0.80 && <p>Accent bonus: +3 (accents above 80%)</p>}
            <p>Final: <span className={`font-semibold tabular-nums ${tone}`}>{Math.round(score)}%</span></p>
            <p className="ui-hint border-t border-border-subtle pt-2">
              Scoring window {scoringWindowMs == null ? 'not saved' : `±${scoringWindowMs.toFixed(1)} ms`}; flam merge {flamMergeMs == null ? 'not saved' : `${flamMergeMs.toFixed(1)} ms`}.
              {' '}Both come from the starting tempo ({session.bpm} BPM) and stay fixed through trainer tempo changes. The beat grid follows captured timing when available.
              {' '}σ measures consistency, so being consistently early or late doesn&apos;t lower it.
            </p>
          </div>
        )}
      </div>
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
