/**
 * Fatigue curve — windowed σ over time.
 * Shows how timing consistency changes throughout the session.
 */

import { useCallback } from 'react';
import { ChartCanvas } from './ChartCanvas';
import type { HitEventsRecord } from '../../store/db';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
  durationMs: number;
}

export function FatigueChart({ hitEvents, width, height, durationMs }: Props) {
  const scored = hitEvents.scoredOnsets.filter((o) => o.scored);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (scored.length < 20) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Need ≥20 hits for fatigue curve', w / 2, h / 2);
        return;
      }

      // Compute windowed σ (window of ~20 onsets, sliding by 5)
      const windowSize = Math.max(10, Math.min(20, Math.floor(scored.length / 5)));
      const step = Math.max(1, Math.floor(windowSize / 4));
      const points: { time: number; sigma: number }[] = [];

      for (let i = 0; i <= scored.length - windowSize; i += step) {
        const window = scored.slice(i, i + windowSize);
        const deltas = window.map((o) => o.delta);
        const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        const variance = deltas.reduce((s, d) => s + (d - mean) * (d - mean), 0) / (deltas.length - 1);
        const sigma = Math.sqrt(variance);
        const midTime = window[Math.floor(window.length / 2)].time;
        points.push({ time: midTime, sigma });
      }

      if (points.length < 2) return;

      const maxSigma = Math.max(...points.map((p) => p.sigma), 10);
      const maxTime = durationMs / 1000;
      const pad = { top: 15, bottom: 25, left: 35, right: 10 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad.top + (i / 4) * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
      }

      // Draw line
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = pad.left + (points[i].time / maxTime) * chartW;
        const y = pad.top + chartH - (points[i].sigma / maxSigma) * chartH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Area fill
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#E8E8EC';
      ctx.lineTo(pad.left + (points[points.length - 1].time / maxTime) * chartW, pad.top + chartH);
      ctx.lineTo(pad.left + (points[0].time / maxTime) * chartW, pad.top + chartH);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // ─── Breakdown point marker ───
      // Find where σ first exceeds 1.3× the session average (fatigue onset)
      const avgSigma = points.reduce((s, p) => s + p.sigma, 0) / points.length;
      const breakdownThreshold = avgSigma * 1.3;
      let breakdownPoint: typeof points[0] | null = null;
      for (let i = Math.floor(points.length * 0.3); i < points.length; i++) {
        if (points[i].sigma > breakdownThreshold) {
          breakdownPoint = points[i];
          break;
        }
      }
      if (breakdownPoint) {
        const bx = pad.left + (breakdownPoint.time / maxTime) * chartW;
        const by = pad.top + chartH - (breakdownPoint.sigma / maxSigma) * chartH;
        // Vertical dashed line
        ctx.strokeStyle = 'rgba(248,113,113,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, pad.top);
        ctx.lineTo(bx, pad.top + chartH);
        ctx.stroke();
        ctx.setLineDash([]);
        // Circle marker
        ctx.fillStyle = '#F87171';
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        // Label
        ctx.fillStyle = '#F87171';
        ctx.font = '8px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('breakdown', bx, pad.top - 2);
      }

      // Y axis labels
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(maxSigma)}ms`, pad.left - 4, pad.top + 4);
      ctx.fillText('0', pad.left - 4, pad.top + chartH + 4);

      // X axis labels
      ctx.textAlign = 'center';
      ctx.fillText('start', pad.left, h - 5);
      ctx.fillText('end', w - pad.right, h - 5);

      // σ label
      ctx.fillStyle = '#8B8B94';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('σ (ms)', pad.left, pad.top - 4);
    },
    [scored, durationMs],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
