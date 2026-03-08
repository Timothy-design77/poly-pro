/**
 * TimelineTab — DAW-style waveform display.
 *
 * Canvas-rendered:
 * - Grey audio waveform
 * - White metronome grid lines (weight: downbeat > beat > subdivision)
 * - Green-shaded scoring window zones
 * - Color-coded onset markers with deviation values at high zoom
 * - Zoom buttons (1×, 2×, 4×, 8×)
 * - Horizontal scroll (drag) within timeline
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import * as db from '../../store/db';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

const ZOOM_LEVELS = [1, 2, 4, 8];

export function TimelineTab({ session, hitEvents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollX, setScrollX] = useState(0);
  const [waveform, setWaveform] = useState<Float32Array | null>(null);
  const [containerWidth, setContainerWidth] = useState(350);
  const touchStartRef = useRef<number | null>(null);
  const scrollStartRef = useRef(0);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Load waveform data (downsample from PCM)
  useEffect(() => {
    if (!session.hasRecording) return;
    db.getRecording(session.id).then((blob) => {
      if (!blob) return;
      blob.arrayBuffer().then((buf) => {
        const pcm = new Float32Array(buf);
        // Downsample to ~2000 points for overview
        const targetPoints = 2000;
        const step = Math.max(1, Math.floor(pcm.length / targetPoints));
        const downsampled = new Float32Array(Math.ceil(pcm.length / step));
        for (let i = 0; i < downsampled.length; i++) {
          let max = 0;
          const start = i * step;
          const end = Math.min(start + step, pcm.length);
          for (let j = start; j < end; j++) {
            const abs = Math.abs(pcm[j]);
            if (abs > max) max = abs;
          }
          downsampled[i] = max;
        }
        setWaveform(downsampled);
      });
    });
  }, [session.id, session.hasRecording]);

  const canvasHeight = 200;
  const totalWidth = containerWidth * zoom;

  // Draw
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = canvasHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, canvasHeight);

    const durationS = session.durationMs / 1000;
    if (durationS <= 0) return;

    const waveH = canvasHeight * 0.5;
    const waveMid = canvasHeight * 0.35;
    const onsetY = canvasHeight * 0.75;

    // ─── Beat grid lines ───
    if (hitEvents) {
      // Reconstruct grid positions from scored onsets
      const bpm = session.bpm;
      const sub = session.subdivision || 1;
      const meterNum = parseInt(session.meter.split('/')[0]) || 4;
      const beatsPerMeasure = meterNum * sub;
      const ioi = 60 / bpm / sub;

      let t = 0;
      let beatIdx = 0;
      while (t < durationS) {
        const x = (t / durationS) * totalWidth;
        const isDownbeat = beatIdx % beatsPerMeasure === 0;
        const isMainBeat = beatIdx % sub === 0;

        ctx.strokeStyle = isDownbeat
          ? 'rgba(255,255,255,0.25)'
          : isMainBeat
            ? 'rgba(255,255,255,0.12)'
            : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = isDownbeat ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();

        t += ioi;
        beatIdx++;
      }
    }

    // ─── Waveform ───
    if (waveform && waveform.length > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const samplesPerPixel = waveform.length / totalWidth;

      for (let x = 0; x < totalWidth; x++) {
        const sampleIdx = Math.floor(x * samplesPerPixel);
        const amp = waveform[Math.min(sampleIdx, waveform.length - 1)] || 0;
        const barH = amp * waveH;
        ctx.fillRect(x, waveMid - barH, 1, barH * 2);
      }
    }

    // ─── Onset markers ───
    if (hitEvents) {
      for (const onset of hitEvents.scoredOnsets) {
        const x = (onset.time / durationS) * totalWidth;

        if (onset.scored) {
          // Color by deviation
          const absDev = Math.abs(onset.delta);
          ctx.fillStyle = absDev < 10
            ? 'rgba(74,222,128,0.8)'
            : absDev < 25
              ? 'rgba(251,191,36,0.7)'
              : 'rgba(248,113,113,0.7)';
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
        }

        // Triangle marker at top
        ctx.beginPath();
        ctx.moveTo(x, onsetY - 6);
        ctx.lineTo(x - 3, onsetY);
        ctx.lineTo(x + 3, onsetY);
        ctx.closePath();
        ctx.fill();

        // Vertical line
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, onsetY);
        ctx.lineTo(x, onsetY + 20);
        ctx.stroke();

        // Deviation label at high zoom
        if (zoom >= 4 && onset.scored) {
          ctx.fillStyle = '#8B8B94';
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          const label = `${onset.delta > 0 ? '+' : ''}${onset.delta.toFixed(1)}`;
          ctx.fillText(label, x, onsetY + 32);
        }
      }
    }
  }, [totalWidth, canvasHeight, waveform, hitEvents, session, zoom]);

  useEffect(() => {
    render();
  }, [render]);

  // Touch scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientX;
      scrollStartRef.current = scrollX;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStartRef.current;
    const maxScroll = Math.max(0, totalWidth - containerWidth);
    setScrollX(Math.max(0, Math.min(maxScroll, scrollStartRef.current - dx)));
    e.preventDefault();
  };

  const handleTouchEnd = () => {
    touchStartRef.current = null;
  };

  if (!session.hasRecording) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm">No recording for this session</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Zoom buttons */}
      <div className="flex gap-1.5">
        {ZOOM_LEVELS.map((z) => (
          <button
            key={z}
            onClick={() => { setZoom(z); setScrollX(0); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold touch-manipulation
              ${zoom === z
                ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                : 'bg-bg-raised text-text-muted'}`}
          >
            {z}×
          </button>
        ))}
      </div>

      {/* Timeline canvas */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-border-subtle"
        style={{ touchAction: 'none' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ transform: `translateX(-${scrollX}px)`, width: totalWidth }}>
          <canvas
            ref={canvasRef}
            style={{ width: totalWidth, height: canvasHeight }}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[9px] text-text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success inline-block" /> &lt;10ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-warning inline-block" /> 10–25ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-danger inline-block" /> &gt;25ms
        </span>
      </div>
    </div>
  );
}
