/**
 * VelocityChart — Phase 9
 *
 * Scatter plot of hit amplitude (peak) over time.
 * Shows velocity decay trend line.
 * Accent beats highlighted with different color.
 */

import { useCallback } from 'react';
import { ChartCanvas } from './ChartCanvas';
import type { HitEventsRecord } from '../../store/db';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
  subdivision: number;
}

export function VelocityChart({ hitEvents, width, height, subdivision }: Props) {
  const scored = hitEvents.scoredOnsets
    .filter((o) => o.scored)
    .sort((a, b) => a.time - b.time);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (scored.length < 10) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data', w / 2, h / 2);
        return;
      }

      const pad = { top: 10, right: 10, bottom: 25, left: 35 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      const peaks = scored.map((o) => o.peak);
      const maxPeak = Math.max(...peaks, 0.1);
      const minTime = scored[0].time;
      const maxTime = scored[scored.length - 1].time;
      const timeRange = maxTime - minTime || 1;

      const toX = (t: number) => pad.left + ((t - minTime) / timeRange) * plotW;
      const toY = (p: number) => pad.top + (1 - p / maxPeak) * plotH;

      // Grid
      ctx.strokeStyle = '#2A2A2E';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }

      // Y axis labels
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText('loud', pad.left - 4, pad.top + 8);
      ctx.fillText('soft', pad.left - 4, pad.top + plotH - 2);

      // Plot dots
      for (const o of scored) {
        const x = toX(o.time);
        const y = toY(o.peak);

        // Color: accent beats (downbeats) vs others
        const isAccent = o.matchedBeatIndex % subdivision === 0 &&
          Math.floor(o.matchedBeatIndex / subdivision) === 0;

        ctx.fillStyle = isAccent ? '#FBBF24' : 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(x, y, isAccent ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Trend line (linear regression)
      const n = scored.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
      for (const o of scored) {
        sumX += o.time;
        sumY += o.peak;
        sumXY += o.time * o.peak;
        sumX2 += o.time * o.time;
      }
      const denom = n * sumX2 - sumX * sumX;
      if (Math.abs(denom) > 1e-10) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;

        const y1 = toY(intercept + slope * minTime);
        const y2 = toY(intercept + slope * maxTime);

        ctx.strokeStyle = slope < -0.001 ? '#F87171' : slope > 0.001 ? '#4ADE80' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(pad.left, y1);
        ctx.lineTo(w - pad.right, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        const label = slope < -0.001 ? 'fading' : slope > 0.001 ? 'building' : 'stable';
        ctx.fillStyle = '#8B8B94';
        ctx.font = '9px "DM Sans", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(label, w - pad.right, y2 - 6);
      }

      // Legend
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.arc(pad.left + 8, h - 8, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('accent', pad.left + 15, h - 5);

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(pad.left + 65, h - 8, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#4A4A52';
      ctx.fillText('other', pad.left + 72, h - 5);
    },
    [scored, subdivision],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
