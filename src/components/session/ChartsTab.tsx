/**
 * ChartsTab — expandable sections for each chart type.
 * All Canvas-rendered per the plan.
 */

import { useState, useRef, useEffect } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import { DistributionChart } from '../analytics/DistributionChart';
import { FatigueChart } from '../analytics/FatigueChart';
import { PerBeatChart } from '../analytics/PerBeatChart';
import { DriftChart } from '../analytics/DriftChart';
import { PushPullChart } from '../analytics/PushPullChart';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

export function ChartsTab({ session, hitEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(320);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setChartWidth(el.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

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
      <ChartSection title="Timing Distribution" defaultOpen
        help="Shows the shape of your timing spread. A tight bell curve centered on zero = great consistency. Wide or skewed = room for improvement.">
        <DistributionChart hitEvents={hitEvents} width={chartWidth} height={180} />
      </ChartSection>

      <ChartSection title="Fatigue Curve"
        help="Tracks your σ (consistency) over the course of the session. Rising line = timing degrading as you tire. Flat or falling = stamina is solid.">
        <FatigueChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Per-Beat Timing"
        help="Shows which beats in the measure you play tightest (green bars) vs loosest (red bars). White dots show mean offset — if a dot is high, you're consistently late on that beat.">
        <PerBeatChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>

      <ChartSection title="Drift"
        help="Shows if your timing drifts systematically over the session. Line above zero = drifting late. Below zero = drifting early. Flat near zero = rock solid.">
        <DriftChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Push/Pull Profile"
        help="Mean offset per beat position. Amber bars = you tend to play that beat late (pushing). Blue bars = you play it early (pulling). Good players often have a slight push/pull pattern — it's called 'feel'.">
        <PushPullChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>
    </div>
  );
}

function ChartSection({
  title,
  defaultOpen = false,
  help,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 touch-manipulation"
      >
        <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
          {title}
          {help && <HelpTip text={help} />}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="px-2 pb-3">{children}</div>}
    </div>
  );
}
