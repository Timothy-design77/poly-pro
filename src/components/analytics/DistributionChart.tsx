/**
 * Distribution histogram — timing spread shape.
 * X axis: deviation in ms (early ← 0 → late)
 * Y axis: count of hits in each bin
 */

import { useCallback } from 'react';
import { ChartCanvas } from './ChartCanvas';
import type { HitEventsRecord } from '../../store/db';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
}

export function DistributionChart({ hitEvents, width, height }: Props) {
  const scored = hitEvents.scoredOnsets.filter((o) => o.scored);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (scored.length < 3) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data', w / 2, h / 2);
        return;
      }

      const deltas = scored.map((o) => o.delta);
      const minD = Math.min(...deltas);
      const maxD = Math.max(...deltas);
      const range = Math.max(Math.abs(minD), Math.abs(maxD), 20);
      const binCount = 25;
      const binWidth = (range * 2) / binCount;
      const bins = new Array(binCount).fill(0);

      for (const d of deltas) {
        const idx = Math.floor((d + range) / binWidth);
        const clamped = Math.max(0, Math.min(binCount - 1, idx));
        bins[clamped]++;
      }

      const maxBin = Math.max(...bins, 1);
      const pad = { top: 20, bottom: 30, left: 10, right: 10 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const barW = chartW / binCount;

      // Draw bars
      for (let i = 0; i < binCount; i++) {
        const barH = (bins[i] / maxBin) * chartH;
        const x = pad.left + i * barW;
        const y = pad.top + chartH - barH;

        const binCenter = -range + (i + 0.5) * binWidth;
        const absDev = Math.abs(binCenter);

        // Color: green near center, amber further, red far
        if (absDev < range * 0.2) ctx.fillStyle = 'rgba(74,222,128,0.6)';
        else if (absDev < range * 0.5) ctx.fillStyle = 'rgba(251,191,36,0.5)';
        else ctx.fillStyle = 'rgba(248,113,113,0.4)';

        ctx.fillRect(x + 1, y, barW - 2, barH);
      }

      // Center line (0ms)
      const zeroX = pad.left + (range / (range * 2)) * chartW;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(zeroX, pad.top);
      ctx.lineTo(zeroX, pad.top + chartH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Labels
      ctx.fillStyle = '#8B8B94';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`-${Math.round(range)}ms`, pad.left, h - 8);
      ctx.fillText('0', zeroX, h - 8);
      ctx.fillText(`+${Math.round(range)}ms`, w - pad.right, h - 8);

      ctx.fillStyle = '#4A4A52';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.fillText('early', pad.left + chartW * 0.2, pad.top - 6);
      ctx.fillText('late', pad.left + chartW * 0.8, pad.top - 6);
    },
    [scored],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
