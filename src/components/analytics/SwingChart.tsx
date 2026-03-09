/**
 * SwingChart — Phase 9
 *
 * Visualizes swing ratio per consecutive beat pair.
 * X axis: beat pair index (time order)
 * Y axis: long/short interval ratio
 * Horizontal line at 1.0 = straight, dashed line at session average.
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

export function SwingChart({ hitEvents, width, height, subdivision }: Props) {
  const scored = hitEvents.scoredOnsets
    .filter((o) => o.scored)
    .sort((a, b) => a.time - b.time);

  // Compute per-pair swing ratios
  const pairs: Array<{ ratio: number; time: number }> = [];

  if (subdivision >= 2) {
    for (let i = 0; i < scored.length - 2; i++) {
      const a = scored[i];
      const b = scored[i + 1];
      const c = scored[i + 2];

      const beatA = a.matchedBeatIndex;
      const beatB = b.matchedBeatIndex;
      const beatC = c.matchedBeatIndex;

      if (beatA % 2 === 0 && beatB === beatA + 1 && beatC === beatA + 2) {
        const interval1 = b.time - a.time;
        const interval2 = c.time - b.time;
        if (interval1 > 0 && interval2 > 0) {
          const longer = Math.max(interval1, interval2);
          const shorter = Math.min(interval1, interval2);
          pairs.push({ ratio: longer / shorter, time: a.time });
        }
      }
    }
  }

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (pairs.length < 3) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          subdivision < 2
            ? 'Swing requires 8th note subdivision'
            : 'Not enough consecutive pairs',
          w / 2,
          h / 2,
        );
        return;
      }

      const pad = { top: 15, right: 10, bottom: 25, left: 40 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;

      // Y range: 0.8 to max ratio (capped at 3.0)
      const maxRatio = Math.min(3.0, Math.max(2.0, ...pairs.map((p) => p.ratio)));
      const minRatio = 0.8;
      const yRange = maxRatio - minRatio;

      const toX = (i: number) => pad.left + (i / (pairs.length - 1)) * plotW;
      const toY = (r: number) => pad.top + (1 - (r - minRatio) / yRange) * plotH;

      // Grid lines
      ctx.strokeStyle = '#2A2A2E';
      ctx.lineWidth = 1;
      const gridValues = [1.0, 1.5, 2.0, 2.5];
      for (const v of gridValues) {
        if (v >= minRatio && v <= maxRatio) {
          const y = toY(v);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(w - pad.right, y);
          ctx.stroke();

          ctx.fillStyle = '#4A4A52';
          ctx.font = '10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(v.toFixed(1), pad.left - 4, y + 3);
        }
      }

      // Straight line at 1.0
      const y1 = toY(1.0);
      ctx.strokeStyle = '#3A3A40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pad.left, y1);
      ctx.lineTo(w - pad.right, y1);
      ctx.stroke();

      // Label "straight"
      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('straight', pad.left + 2, y1 - 4);

      // Average ratio line (dashed)
      const avgRatio = pairs.reduce((s, p) => s + p.ratio, 0) / pairs.length;
      const yAvg = toY(avgRatio);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(pad.left, yAvg);
      ctx.lineTo(w - pad.right, yAvg);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label average
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`avg ${avgRatio.toFixed(2)}`, w - pad.right, yAvg - 4);

      // Plot dots
      for (let i = 0; i < pairs.length; i++) {
        const x = toX(i);
        const y = toY(pairs[i].ratio);

        // Color: green if close to average, amber if varying
        const dev = Math.abs(pairs[i].ratio - avgRatio);
        const color = dev < 0.2 ? '#4ADE80' : dev < 0.4 ? '#FBBF24' : '#F87171';

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Smoothed trend line
      if (pairs.length > 5) {
        const windowSize = Math.max(3, Math.floor(pairs.length / 8));
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < pairs.length; i++) {
          const start = Math.max(0, i - Math.floor(windowSize / 2));
          const end = Math.min(pairs.length, start + windowSize);
          const windowSlice = pairs.slice(start, end);
          const smoothed = windowSlice.reduce((s, p) => s + p.ratio, 0) / windowSlice.length;

          const x = toX(i);
          const y = toY(smoothed);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // X axis label
      ctx.fillStyle = '#4A4A52';
      ctx.font = '10px "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Beat pair →', w / 2, h - 3);
    },
    [pairs, subdivision],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
