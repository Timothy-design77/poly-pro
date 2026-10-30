import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cssVar } from '../../../styles/tokens';

const HEIGHT = 88;
const HANDLE_HIT = 22; // px either side of a handle that grabs it

interface Props {
  pcm: Float32Array;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
}

/**
 * Waveform with draggable start/end handles. Each handle is also a keyboard
 * slider (arrows move 1 ms, Shift+arrows 10 ms).
 */
export function WaveformTrimmer({ pcm, trimStart, trimEnd, onTrimChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const draggingRef = useRef<'start' | 'end' | null>(null);
  const durationMs = (pcm.length / 48000) * 1000;
  const minFrac = (48000 * 0.005) / pcm.length; // 5 ms minimum selection

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const ink = cssVar('--text-primary', '#15171A');
    const faint = cssVar('--text-faint', '#969DA7');
    ctx.fillStyle = cssVar('--bg-surface', '#FFFFFF');
    ctx.fillRect(0, 0, width, HEIGHT);

    const samplesPerBin = Math.max(1, Math.floor(pcm.length / width));
    for (let i = 0; i < width; i++) {
      const start = i * samplesPerBin;
      let maxAbs = 0;
      for (let j = start; j < start + samplesPerBin && j < pcm.length; j++) maxAbs = Math.max(maxAbs, Math.abs(pcm[j]));
      const h = Math.min(1, maxAbs) * (HEIGHT - 12);
      const frac = i / width;
      ctx.fillStyle = frac >= trimStart && frac <= trimEnd ? ink : faint;
      ctx.fillRect(i, (HEIGHT - h) / 2, 1, Math.max(1, h));
    }

    // Wash out the discarded regions.
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = cssVar('--bg-raised', '#E7E9ED');
    ctx.fillRect(0, 0, trimStart * width, HEIGHT);
    ctx.fillRect(trimEnd * width, 0, (1 - trimEnd) * width, HEIGHT);
    ctx.globalAlpha = 1;

    ctx.fillStyle = cssVar('--accent', '#171A1F');
    for (const x of [trimStart * width, trimEnd * width]) {
      ctx.fillRect(x - 1, 0, 2, HEIGHT);
      ctx.fillRect(x - 4, HEIGHT / 2 - 12, 8, 24);
    }
  }, [pcm, width, trimStart, trimEnd]);

  const handleAt = useCallback((clientX: number): 'start' | 'end' => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const threshold = HANDLE_HIT / rect.width;
    const distStart = Math.abs(x - trimStart);
    const distEnd = Math.abs(x - trimEnd);
    if (distStart < threshold && distStart <= distEnd) return 'start';
    if (distEnd < threshold) return 'end';
    return distStart < distEnd ? 'start' : 'end';
  }, [trimStart, trimEnd]);

  const moveHandle = useCallback((handle: 'start' | 'end', frac: number) => {
    if (handle === 'start') onTrimChange(Math.max(0, Math.min(frac, trimEnd - minFrac)), trimEnd);
    else onTrimChange(trimStart, Math.min(1, Math.max(frac, trimStart + minFrac)));
  }, [trimStart, trimEnd, minFrac, onTrimChange]);

  const onKey = (handle: 'start' | 'end') => (event: KeyboardEvent) => {
    const stepMs = event.shiftKey ? 10 : 1;
    const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = handle === 'start' ? trimStart : trimEnd;
    moveHandle(handle, current + (delta * stepMs) / durationMs);
  };

  const handleProps = (handle: 'start' | 'end') => {
    const frac = handle === 'start' ? trimStart : trimEnd;
    const ms = Math.round(frac * durationMs);
    return {
      role: 'slider' as const,
      tabIndex: 0,
      'aria-label': handle === 'start' ? 'Sample start' : 'Sample end',
      'aria-valuemin': 0,
      'aria-valuemax': Math.round(durationMs),
      'aria-valuenow': ms,
      'aria-valuetext': `${ms} milliseconds`,
      onKeyDown: onKey(handle),
      className: 'pointer-events-none absolute top-0 bottom-0 w-11 -ml-[22px] rounded-md outline-offset-[-2px]',
      style: { left: `${frac * 100}%` },
    };
  };

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-xl border border-border-subtle" style={{ height: HEIGHT }}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ width, height: HEIGHT, touchAction: 'none' }}
        className="block cursor-col-resize"
        onPointerDown={(event) => {
          draggingRef.current = handleAt(event.clientX);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!draggingRef.current) return;
          const rect = event.currentTarget.getBoundingClientRect();
          moveHandle(draggingRef.current, Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)));
        }}
        onPointerUp={() => { draggingRef.current = null; }}
        onPointerCancel={() => { draggingRef.current = null; }}
      />
      <div {...handleProps('start')} />
      <div {...handleProps('end')} />
    </div>
  );
}
