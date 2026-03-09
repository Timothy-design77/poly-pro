/**
 * InstrumentChart — Phase 8
 *
 * Per-instrument timing comparison chart.
 * Shows σ and mean offset for each classified instrument
 * as grouped bars with color-coded instrument markers.
 */

import { useCallback, useMemo } from 'react';
import { ChartCanvas } from './ChartCanvas';
import type { HitEventsRecord } from '../../store/db';
import { computeInstrumentMetrics, INSTRUMENT_INFO } from '../../analysis/classification';
import type { ClassificationResult, InstrumentName } from '../../analysis/classification';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
}

export function InstrumentChart({ hitEvents, width, height }: Props) {
  const metrics = useMemo(() => {
    const scored = hitEvents.scoredOnsets.filter((o) => o.scored);
    const hasClassification = scored.some((o) => o.instrumentLabel);
    if (!hasClassification) return [];

    const classifications: ClassificationResult[] = scored.map((o) => ({
      label: (o.instrumentLabel as ClassificationResult['label']) ?? 'Unknown',
      confidence: o.instrumentConfidence ?? 0,
      topCandidates: (o.instrumentCandidates ?? []) as ClassificationResult['topCandidates'],
    }));

    const deltas = scored.map((o) => o.delta);
    const peaks = scored.map((o) => o.peak);

    return computeInstrumentMetrics(classifications, deltas, peaks);
  }, [hitEvents]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (metrics.length === 0) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No instrument classification data', w / 2, h / 2);
        return;
      }

      const pad = { top: 20, right: 10, bottom: 35, left: 50 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      // Two metrics per instrument: σ and |meanOffset|
      const barGroupWidth = plotW / metrics.length;
      const barWidth = Math.min(18, barGroupWidth * 0.35);
      const gap = 4;

      // Y scale: max of all σ and |meanOffset| values
      const maxVal = Math.max(
        ...metrics.map((m) => m.sigma),
        ...metrics.map((m) => Math.abs(m.meanOffset)),
        10, // minimum scale
      );

      const toY = (val: number) => pad.top + (1 - val / maxVal) * plotH;

      // Grid lines
      ctx.strokeStyle = '#2A2A2E';
      ctx.lineWidth = 1;
      const gridSteps = [0, maxVal * 0.25, maxVal * 0.5, maxVal * 0.75, maxVal];
      for (const v of gridSteps) {
        const y = toY(v);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        // Y labels
        ctx.fillStyle = '#4A4A52';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${v.toFixed(0)}ms`, pad.left - 4, y + 3);
      }

      // Bars
      for (let i = 0; i < metrics.length; i++) {
        const m = metrics[i];
        const groupCenter = pad.left + (i + 0.5) * barGroupWidth;
        const info = m.name !== 'Unknown'
          ? INSTRUMENT_INFO[m.name as InstrumentName]
          : { icon: '❓', color: '#8B8B94' };

        // σ bar (left)
        const sigmaX = groupCenter - barWidth - gap / 2;
        const sigmaH = (m.sigma / maxVal) * plotH;
        ctx.fillStyle = info.color + 'CC';
        ctx.fillRect(sigmaX, toY(m.sigma), barWidth, sigmaH);

        // |meanOffset| bar (right)
        const offsetX = groupCenter + gap / 2;
        const offsetH = (Math.abs(m.meanOffset) / maxVal) * plotH;
        ctx.fillStyle = info.color + '66';
        ctx.fillRect(offsetX, toY(Math.abs(m.meanOffset)), barWidth, offsetH);

        // Instrument label
        ctx.fillStyle = '#8B8B94';
        ctx.font = '9px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, groupCenter, h - pad.bottom + 14);

        // Hit count
        ctx.fillStyle = '#4A4A52';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillText(`${m.hitCount}`, groupCenter, h - pad.bottom + 24);
      }

      // Legend
      const legendY = 8;
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(pad.left, legendY, 8, 8);
      ctx.fillStyle = '#8B8B94';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('σ', pad.left + 12, legendY + 7);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(pad.left + 28, legendY, 8, 8);
      ctx.fillStyle = '#8B8B94';
      ctx.fillText('|offset|', pad.left + 40, legendY + 7);
    },
    [metrics],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
