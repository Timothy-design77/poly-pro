import { useState, useRef, useEffect } from 'react';

export function HomePage() {
  const [bpm] = useState(120.0);
  const [isPlaying] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(200);

  // Size dial to fill the top half without clipping
  useEffect(() => {
    const measure = () => {
      const el = dialContainerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      // Use the smaller dimension with padding so it never clips
      const size = Math.min(w, h) - 24;
      setDialSize(Math.max(140, size));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header: project context */}
      <div className="flex items-center gap-2 py-2 px-4 shrink-0">
        <span className="text-base">🥁</span>
        <span className="text-sm font-medium text-text-primary">My First Project</span>
        <span className="text-xs font-mono text-text-muted ml-auto">—%</span>
      </div>

      {/* Dial — fills the top half */}
      <div
        ref={dialContainerRef}
        className="flex-1 flex items-center justify-center min-h-0"
      >
        <div
          className="relative rounded-full border-2 border-border-subtle flex flex-col items-center justify-center"
          style={{ width: dialSize, height: dialSize }}
        >
          {/* Beat dots */}
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            const r = dialSize / 2 - 14;
            const cx = dialSize / 2 + Math.cos(angle) * r;
            const cy = dialSize / 2 + Math.sin(angle) * r;
            const dotSize = Math.max(6, dialSize * 0.028);
            return (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: dotSize,
                  height: dotSize,
                  left: cx - dotSize / 2,
                  top: cy - dotSize / 2,
                  backgroundColor:
                    i === 0
                      ? 'rgba(255,255,255,0.85)'
                      : 'rgba(255,255,255,0.15)',
                }}
              />
            );
          })}

          {/* BPM display */}
          <span
            className="font-mono font-bold text-text-primary leading-none"
            style={{ fontSize: Math.max(24, dialSize * 0.18) }}
          >
            {bpm.toFixed(1)}
          </span>
          <span className="text-xs text-text-muted mt-1 font-sans">BPM</span>
          <span className="text-[10px] text-text-muted mt-0.5 font-sans">
            4/4 · 8ths
          </span>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex flex-col gap-2 px-4 pb-4 pt-1 shrink-0">
        {/* ± tempo buttons — big, side by side */}
        <div className="flex gap-2">
          <button
            className="flex-1 py-3.5 rounded-md border border-border-subtle bg-bg-surface
                       text-xl text-text-primary font-medium
                       active:bg-bg-raised active:border-border-emphasis transition-all min-h-[52px]"
          >
            −
          </button>
          <button
            className="flex-1 py-3.5 rounded-md border border-border-subtle bg-bg-surface
                       text-xl text-text-primary font-medium
                       active:bg-bg-raised active:border-border-emphasis transition-all min-h-[52px]"
          >
            +
          </button>
        </div>

        {/* START button */}
        <button
          className={`w-full py-3.5 rounded-md text-sm font-semibold tracking-wide transition-all min-h-[52px]
            ${
              isPlaying
                ? 'bg-bg-raised text-text-primary border border-border-emphasis'
                : 'bg-[rgba(255,255,255,0.85)] text-bg-primary'
            }`}
        >
          {isPlaying ? 'STOP' : 'START'}
        </button>

        {/* RECORD + TAP TEMPO row */}
        <div className="flex gap-2">
          <button
            className="flex-1 py-3 rounded-md border border-danger/30 text-danger text-sm font-medium
                       bg-danger-dim/50 active:bg-danger/20 transition-colors min-h-[44px]"
          >
            RECORD
          </button>
          <button
            className="flex-1 py-3 rounded-md border border-border-subtle text-text-secondary text-sm font-medium
                       bg-bg-surface active:bg-bg-raised transition-colors min-h-[44px]"
          >
            TAP TEMPO
          </button>
        </div>
      </div>
    </div>
  );
}
