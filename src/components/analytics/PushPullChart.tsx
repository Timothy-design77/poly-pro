/**
 * Push/Pull profile — systematic timing pattern per beat position.
 * Shows mean offset per beat (not σ like PerBeatChart).
 * Positive = consistently late on that beat, negative = consistently early.
 *
 * Canvas-rendered per plan.
 */

import { useRef, useEffect } from 'react';
import type { HitEventsRecord } from '../../store/db';

interface Props {
  hitEvents: HitEventsRecord;
  width: number;
  height: number;
}

export function PushPullChart({ hitEvents, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const scored = hitEvents.scoredOnsets.filter((o) => o.scored);
    if (scored.length === 0) return;

    // Group by beat index, compute mean offset per beat
    const beatMap = new Map<number, number[]>();
    for (const o of scored) {
      const arr = beatMap.get(o.matchedBeatIndex) || [];
      arr.push(o.delta);
      beatMap.set(o.matchedBeatIndex, arr);
    }

    const beatIndices = [...beatMap.keys()].sort((a, b) => a - b);
    if (beatIndices.length === 0) return;

    const beatMeans: { index: number; mean: number }[] = [];
    for (const idx of beatIndices) {
      const deltas = beatMap.get(idx)!;
      const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
      beatMeans.push({ index: idx, mean });
    }

    // Chart dimensions
    const padL = 40;
    const padR = 10;
    const padT = 15;
    const padB = 25;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const maxAbs = Math.max(5, ...beatMeans.map((b) => Math.abs(b.mean)));
    const barW = Math.min(24, (chartW / beatMeans.length) * 0.6);
    const gap = (chartW - barW * beatMeans.length) / (beatMeans.length + 1);

    // Zero line
    const zeroY = padT + chartH / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, zeroY);
    ctx.lineTo(width - padR, zeroY);
    ctx.stroke();

    // Zero label
    ctx.fillStyle = '#4A4A52';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('0ms', padL - 4, zeroY + 3);

    // Scale labels
    ctx.fillText(`-${maxAbs.toFixed(0)}`, padL - 4, padT + 8);
    ctx.fillText(`+${maxAbs.toFixed(0)}`, padL - 4, padT + chartH);

    // "Early"/"Late" labels
    ctx.fillStyle = '#4A4A52';
    ctx.font = '8px "DM Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('early', padL + 2, padT + 8);
    ctx.fillText('late', padL + 2, padT + chartH);

    // Bars
    for (let i = 0; i < beatMeans.length; i++) {
      const { index, mean } = beatMeans[i];
      const x = padL + gap + i * (barW + gap);
      const barH = (mean / maxAbs) * (chartH / 2);

      // Color: green if close to 0, blue if early, amber if late
      if (mean > 0) {
        ctx.fillStyle = 'rgba(251,191,36,0.6)'; // late = amber
      } else {
        ctx.fillStyle = 'rgba(96,165,250,0.6)'; // early = blue
      }

      ctx.fillRect(x, zeroY, barW, -barH);

      // Beat label
      ctx.fillStyle = '#8B8B94';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(index + 1), x + barW / 2, height - 6);
    }
  }, [hitEvents, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
    />
  );
}
