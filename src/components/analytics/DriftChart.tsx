/**
 * Drift curve — cumulative deviation over session.
 * Shows if the player drifts systematically over time.
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

export function DriftChart({ hitEvents, width, height, durationMs }: Props) {
  const scored = hitEvents.scoredOnsets.filter((o) => o.scored);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (scored.length < 5) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data', w / 2, h / 2);
        return;
      }

      // Compute smoothed running average offset (moving avg, window of 10)
      const windowSize = Math.min(10, Math.max(3, Math.floor(scored.length / 10)));
      const points: { time: number; avgOffset: number }[] = [];

      for (let i = 0; i <= scored.length - windowSize; i++) {
        const window = scored.slice(i, i + windowSize);
        const avgOffset = window.reduce((s, o) => s + o.delta, 0) / window.length;
        const midTime = window[Math.floor(window.length / 2)].time;
        points.push({ time: midTime, avgOffset });
      }

      if (points.length < 2) return;

      const maxTime = durationMs / 1000;
      const maxAbs = Math.max(...points.map((p) => Math.abs(p.avgOffset)), 10);
      const pad = { top: 15, bottom: 25, left: 40, right: 10 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const midY = pad.top + chartH / 2;

      // Grid
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, midY);
      ctx.lineTo(w - pad.right, midY);
      ctx.stroke();

      // Draw line
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = pad.left + (points[i].time / maxTime) * chartW;
        const y = midY - (points[i].avgOffset / maxAbs) * (chartH / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Color fill (late = above center, early = below)
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#E8E8EC';
      ctx.lineTo(pad.left + (points[points.length - 1].time / maxTime) * chartW, midY);
      ctx.lineTo(pad.left + (points[0].time / maxTime) * chartW, midY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // Labels
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`+${Math.round(maxAbs)}ms`, pad.left - 4, pad.top + 4);
      ctx.fillText('0', pad.left - 4, midY + 4);
      ctx.fillText(`-${Math.round(maxAbs)}ms`, pad.left - 4, pad.top + chartH + 4);

      ctx.textAlign = 'center';
      ctx.fillText('start', pad.left, h - 5);
      ctx.fillText('end', w - pad.right, h - 5);

      // Direction labels
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('late ↑', pad.left + 4, pad.top + 12);
      ctx.fillText('early ↓', pad.left + 4, pad.top + chartH - 4);
    },
    [scored, durationMs],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
