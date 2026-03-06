import { useRef, useEffect } from 'react';

interface WaveformDisplayProps {
  micLevel: number; // 0-1 peak
  isRecording: boolean;
}

/**
 * Thin waveform bar showing live mic level during recording.
 * Uses canvas for smooth updates.
 */
export function WaveformDisplay({ micLevel, isRecording }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>(new Array(120).fill(0));
  const posRef = useRef(0);

  useEffect(() => {
    if (!isRecording) {
      historyRef.current = new Array(120).fill(0);
      posRef.current = 0;
      return;
    }

    // Push new level into circular buffer
    historyRef.current[posRef.current % 120] = micLevel;
    posRef.current++;

    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const hist = historyRef.current;
    const len = Math.min(posRef.current, 120);
    const startIdx = Math.max(0, posRef.current - 120);
    const barWidth = w / 120;

    for (let i = 0; i < len; i++) {
      const idx = (startIdx + i) % 120;
      const level = hist[idx];
      const barH = Math.max(1, level * h * 0.9);
      const x = i * barWidth;
      const y = (h - barH) / 2;

      // Color: green for low, amber for mid, red for clipping
      if (level > 0.9) {
        ctx.fillStyle = 'rgba(248,113,113,0.7)';
      } else if (level > 0.5) {
        ctx.fillStyle = 'rgba(251,191,36,0.5)';
      } else {
        ctx.fillStyle = 'rgba(74,222,128,0.4)';
      }

      ctx.fillRect(x, y, Math.max(1, barWidth - 0.5), barH);
    }
  }, [micLevel, isRecording]);

  if (!isRecording) return null;

  return (
    <div className="w-full h-[28px] rounded-lg bg-bg-surface border border-border-subtle overflow-hidden mt-2">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
      />
    </div>
  );
}
