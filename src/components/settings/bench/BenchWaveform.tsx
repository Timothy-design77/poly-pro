import { useEffect, useRef } from 'react';
import type { DetectedOnset } from '../../../analysis/types';
import { estimateNoiseFloor } from '../../../analysis/onset-detection';
import { cssVar } from '../../../styles/tokens';

const HEIGHT = 112;

/** Test take waveform with the noise gate band and detected-hit markers. */
export function BenchWaveform({ pcm, sampleRate, detections, noiseGate, noiseFloorMultiplier }: {
  pcm: Float32Array;
  sampleRate: number;
  detections: DetectedOnset[];
  noiseGate: number;
  noiseFloorMultiplier: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = containerRef.current?.clientWidth ?? 320;
    const h = HEIGHT;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const muted = cssVar('--text-muted', '#5F6670');

    ctx.fillStyle = cssVar('--bg-surface', '#FFFFFF');
    ctx.fillRect(0, 0, w, h);

    const plotH = h - 28; // leave room for peak labels
    const mid = 6 + plotH / 2;
    const samplesPerPx = Math.max(1, Math.floor(pcm.length / w));
    ctx.fillStyle = cssVar('--text-faint', '#969DA7');
    for (let x = 0; x < w; x++) {
      const start = x * samplesPerPx;
      let maxAbs = 0;
      for (let j = start; j < start + samplesPerPx && j < pcm.length; j++) maxAbs = Math.max(maxAbs, Math.abs(pcm[j]));
      const barH = Math.min(1, maxAbs) * plotH;
      ctx.fillRect(x, mid - barH / 2, 1, Math.max(1, barH));
    }

    // Noise gate band
    const gate = Math.max(estimateNoiseFloor(pcm, sampleRate, noiseFloorMultiplier), noiseGate);
    ctx.strokeStyle = cssVar('--danger', '#B4232C');
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, mid - (gate * plotH) / 2); ctx.lineTo(w, mid - (gate * plotH) / 2);
    ctx.moveTo(0, mid + (gate * plotH) / 2); ctx.lineTo(w, mid + (gate * plotH) / 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const duration = pcm.length / sampleRate;
    const success = cssVar('--success', '#187A3B');
    const warning = cssVar('--warning', '#A45108');
    ctx.font = '11px "DM Sans", sans-serif';
    ctx.textAlign = 'center';
    for (const d of detections) {
      const x = (d.time / duration) * w;
      const color = d.isFlam ? warning : success;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, 6 + plotH); ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(x, 2); ctx.lineTo(x - 4, 8); ctx.lineTo(x + 4, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = muted;
      ctx.fillText(d.peak.toFixed(2), x, h - 6);
    }
  }, [pcm, sampleRate, detections, noiseGate, noiseFloorMultiplier]);

  return (
    <figure ref={containerRef} className="overflow-hidden rounded-xl border border-border-subtle">
      <canvas ref={canvasRef} role="img" aria-label={`Test recording with ${detections.length} detected hit${detections.length === 1 ? '' : 's'}. Dashed lines mark the noise gate.`} />
    </figure>
  );
}
