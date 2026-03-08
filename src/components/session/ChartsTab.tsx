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

  if (!hitEvents || !session.analyzed) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm">No analysis data available</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-2">
      <ChartSection title="Timing Distribution" defaultOpen>
        <DistributionChart hitEvents={hitEvents} width={chartWidth} height={180} />
      </ChartSection>

      <ChartSection title="Fatigue Curve">
        <FatigueChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Per-Beat Timing">
        <PerBeatChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>

      <ChartSection title="Drift">
        <DriftChart hitEvents={hitEvents} width={chartWidth} height={160} durationMs={session.durationMs} />
      </ChartSection>

      <ChartSection title="Push/Pull Profile">
        <PushPullChart hitEvents={hitEvents} width={chartWidth} height={160} />
      </ChartSection>
    </div>
  );
}

function ChartSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-bg-surface rounded-xl border border-border-subtle overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 touch-manipulation"
      >
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
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
