/**
 * ChartsTab — expandable sections for each chart type.
 * All Canvas-rendered per the plan.
 */

import { useState, useRef, useEffect, useId } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import { DistributionChart } from '../analytics/DistributionChart';
import { FatigueChart } from '../analytics/FatigueChart';
import { PerBeatChart } from '../analytics/PerBeatChart';
import { DriftChart } from '../analytics/DriftChart';
import { PushPullChart } from '../analytics/PushPullChart';
import { SwingChart } from '../analytics/SwingChart';
import { VelocityChart } from '../analytics/VelocityChart';
import { InstrumentChart } from '../analytics/InstrumentChart';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  autoOpenSection?: string | null;
}

export function ChartsTab({ session, hitEvents, autoOpenSection }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setChartWidth(Math.max(120, el.clientWidth - 18));
    measure();
    const observer = new ResizeObserver(measure); observer.observe(el);
    return () => observer.disconnect();
  }, [!!hitEvents]);

  if (!hitEvents) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm text-center">
          {session.analyzed
            ? 'Onset data not found — try recording a new session'
            : 'Record a session to see charts'}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <ChartSection title="Timing distribution" id="distribution"
        defaultOpen={!autoOpenSection || autoOpenSection === 'distribution'}
        help="Shows the shape of your timing spread. A tight bell curve centered on zero = great consistency.">
        <DistributionChart hitEvents={hitEvents} width={chartWidth} height={180} />
      </ChartSection>

      <ChartSection title="Fatigue curve" id="fatigue"
        defaultOpen={autoOpenSection === 'fatigue'}
        help="Tracks your σ (consistency) over the course of the session. Rising line = timing degrading.">
        <FatigueChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Timing by beat" id="per-beat"
        defaultOpen={autoOpenSection === 'per-beat'}
        help="Shows which beats in the measure you play tightest vs loosest.">
        <PerBeatChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>

      <ChartSection title="Drift" id="drift"
        defaultOpen={autoOpenSection === 'drift'}
        help="Shows if your timing drifts systematically over the session.">
        <DriftChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Push and pull" id="push-pull"
        defaultOpen={autoOpenSection === 'push-pull'}
        help="Mean offset per beat position. Amber = consistently late, blue = consistently early.">
        <PushPullChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>

      <ChartSection title="Swing" id="swing"
        defaultOpen={autoOpenSection === 'swing'}
        help="Long/short ratio of consecutive 8th-note pairs. 1.0 = straight time. ~1.67 = jazz swing. Only available with 8th note subdivision.">
        <SwingChart hitEvents={hitEvents} width={chartWidth} height={160} subdivision={session.subdivision} />
      </ChartSection>

      <ChartSection title="Dynamics" id="velocity"
        defaultOpen={autoOpenSection === 'velocity'}
        help="Hit amplitude over time. Yellow dots = accent beats (downbeats). Dashed line = trend. Shows if volume stays consistent or fades.">
        <VelocityChart hitEvents={hitEvents} width={chartWidth} height={160} subdivision={session.subdivision} />
      </ChartSection>

      <ChartSection title="Timing by instrument" id="instrument"
        defaultOpen={autoOpenSection === 'instrument'}
        help="σ (consistency) and mean offset for each classified instrument. Requires instrument training. Darker bars = σ, lighter bars = offset.">
        <InstrumentChart hitEvents={hitEvents} width={chartWidth} height={180} />
      </ChartSection>
    </div>
  );
}

function ChartSection({
  title,
  id,
  defaultOpen = false,
  help,
  children,
}: {
  title: string;
  id?: string;
  defaultOpen?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  return (
    <div id={`chart-${id}`} className="ui-surface overflow-hidden">
      <div className="flex items-center">
      <button
        type="button" aria-expanded={open} aria-controls={contentId}
        onClick={() => setOpen(!open)}
        className="flex-1 min-w-0 min-h-[52px] flex items-center justify-between px-4 py-2.5 touch-manipulation"
      >
        <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
          {title}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {help && <div className="pr-3"><HelpTip text={help} /></div>}
      </div>
      <div id={contentId} hidden={!open} className="px-2 pb-3">{open && children}</div>
    </div>
  );
}
