import { useState } from 'react';
import type { InstrumentMetrics } from '../../../analysis/classification';
import { HelpTip } from '../../ui/HelpTip';

interface Correlation {
  instrumentA: string;
  instrumentB: string;
  correlation: number;
  pairCount: number;
}

const signed = (value: number, digits = 1) => `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

/** Per-instrument timing rows (expandable) and inter-limb correlations. */
export function InstrumentBreakdown({ metrics, correlations }: { metrics: InstrumentMetrics[]; correlations: Correlation[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <>
      {metrics.length > 0 && (
        <section aria-label="Per instrument" className="ui-surface px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            Per instrument
            <HelpTip text="Timing by instrument. Only instruments with at least 10 confidently classified hits get a row." />
          </h3>
          <div className="mt-1 grid grid-cols-[1fr_auto_auto] gap-x-3 text-xs text-text-secondary" aria-hidden="true">
            <span /><span className="w-16 text-right">Offset</span><span className="w-14 text-right">σ</span>
          </div>
          <ul className="ui-rows">
            {metrics.map((m) => (
              <li key={m.name}>
                <button type="button" aria-expanded={expanded === m.name} onClick={() => setExpanded(expanded === m.name ? null : m.name)}
                  className="grid min-h-[44px] w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 text-left text-sm tabular-nums">
                  <span className="truncate text-text-primary">{m.name} <span className="text-xs text-text-muted">· {m.hitCount} hits</span></span>
                  <span className="w-16 text-right text-text-secondary">{signed(m.meanOffset)} ms</span>
                  <span className="w-14 text-right font-semibold text-text-primary">{m.sigma.toFixed(1)}</span>
                </button>
                {expanded === m.name && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pb-3 text-xs text-text-secondary">
                    <dt>Mean offset</dt><dd className="tabular-nums">{signed(m.meanOffset, 2)} ms · {m.meanOffset > 3 ? 'tends late' : m.meanOffset < -3 ? 'tends early' : 'centered'}</dd>
                    <dt>Spread σ</dt><dd className="tabular-nums">{m.sigma.toFixed(2)} ms</dd>
                    <dt>Fatigue</dt><dd className={`tabular-nums ${m.fatigueRatio > 1.3 ? 'text-warning' : ''}`}>{m.fatigueRatio.toFixed(2)}× · {m.fatigueRatio > 1.3 ? 'degrading' : m.fatigueRatio < 0.8 ? 'improving' : 'stable'}</dd>
                    <dt>Volume</dt><dd className="tabular-nums">{m.balanceRatio.toFixed(2)}× · {m.balanceRatio > 1.2 ? 'louder than average' : m.balanceRatio < 0.8 ? 'quieter than average' : 'balanced'}</dd>
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {correlations.length > 0 && (
        <section aria-label="Inter-limb correlation" className="ui-surface px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            Inter-limb correlation
            <HelpTip text="How the timing of instruments hit together moves. High positive: limbs rush or drag together. Negative: one rushes while the other drags." />
          </h3>
          <ul className="ui-rows mt-1">
            {correlations.map((c, i) => (
              <li key={i} className="flex min-h-[40px] items-center gap-2 text-sm">
                <span className="text-text-primary">{c.instrumentA} and {c.instrumentB}</span>
                <span className={`ml-auto font-semibold tabular-nums ${Math.abs(c.correlation) > 0.5 ? 'text-warning' : 'text-text-secondary'}`}>r = {c.correlation.toFixed(2)}</span>
                <span className="text-xs text-text-muted tabular-nums">{c.pairCount} pairs</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
