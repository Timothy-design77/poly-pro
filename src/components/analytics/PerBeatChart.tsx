/**
 * Per-beat chart — σ and mean offset per beat position.
 * Shows which beats in the measure are tightest/loosest.
 */

import { useCallback } from 'react';
import { ChartCanvas } from './ChartCanvas';
import type { HitEventsRecord } from '../../store/db';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
}

export function PerBeatChart({ hitEvents, width, height }: Props) {
  const scored = hitEvents.scoredOnsets.filter((o) => o.scored);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (scored.length < 4) {
        ctx.fillStyle = '#4A4A52';
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Not enough data', w / 2, h / 2);
        return;
      }

      // Group by beat index
      const byBeat = new Map<number, number[]>();
      for (const o of scored) {
        const idx = o.matchedBeatIndex;
        if (!byBeat.has(idx)) byBeat.set(idx, []);
        byBeat.get(idx)!.push(o.delta);
      }

      // Compute per-beat stats
      const beatIndices = [...byBeat.keys()].sort((a, b) => a - b);
      const stats = beatIndices.map((idx) => {
        const deltas = byBeat.get(idx)!;
        const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
        const variance = deltas.length > 1
          ? deltas.reduce((s, d) => s + (d - mean) * (d - mean), 0) / (deltas.length - 1)
          : 0;
        return { beatIndex: idx, mean, sigma: Math.sqrt(variance), count: deltas.length };
      });

      const maxSigma = Math.max(...stats.map((s) => s.sigma), 5);
      const maxOffset = Math.max(...stats.map((s) => Math.abs(s.mean)), 10);
      const pad = { top: 20, bottom: 30, left: 10, right: 10 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;
      const barW = chartW / stats.length;

      // Draw σ bars
      for (let i = 0; i < stats.length; i++) {
        const s = stats[i];
        const barH = (s.sigma / maxSigma) * chartH * 0.8;
        const x = pad.left + i * barW;
        const y = pad.top + chartH - barH;

        // Color by sigma quality
        if (s.sigma < maxSigma * 0.3) ctx.fillStyle = 'rgba(74,222,128,0.5)';
        else if (s.sigma < maxSigma * 0.6) ctx.fillStyle = 'rgba(251,191,36,0.4)';
        else ctx.fillStyle = 'rgba(248,113,113,0.4)';

        ctx.fillRect(x + 2, y, barW - 4, barH);

        // Mean offset dot
        const dotY = pad.top + chartH / 2 - (s.mean / maxOffset) * (chartH / 2) * 0.4;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x + barW / 2, dotY, 3, 0, Math.PI * 2);
        ctx.fill();

        // Beat label
        ctx.fillStyle = '#4A4A52';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(s.beatIndex + 1), x + barW / 2, h - 8);
      }

      // Zero line for offset
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.left, pad.top + chartH / 2);
      ctx.lineTo(w - pad.right, pad.top + chartH / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Legend
      ctx.fillStyle = '#8B8B94';
      ctx.font = '9px "DM Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('bars = σ, dots = mean offset', pad.left, pad.top - 6);
    },
    [scored],
  );

  return <ChartCanvas width={width} height={height} draw={draw} />;
}
