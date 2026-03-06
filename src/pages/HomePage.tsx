import { useState, useRef, useEffect } from 'react';

export function HomePage() {
  const [bpm] = useState(120.0);
  const [isPlaying] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const dialCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dialSize, setDialSize] = useState(200);

  // Size dial to container
  useEffect(() => {
    const measure = () => {
      const el = dialContainerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const size = Math.min(w - 24, h - 12);
      setDialSize(Math.max(140, Math.min(320, size)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Draw dial on canvas
  useEffect(() => {
    const c = dialCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 2;
    c.width = dialSize * dpr;
    c.height = dialSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, dialSize, dialSize);

    const cx = dialSize / 2;
    const cy = dialSize / 2;
    const R = dialSize / 2 - 18;

    // Accuracy arc (outer ring)
    const accuracy = 87;
    const sa = -Math.PI / 2;
    const ea = sa + (accuracy / 100) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7, sa, ea);
    ctx.strokeStyle = 'rgba(74,222,128,0.27)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Main ring
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Beat dots — 4/4 with 8ths = 8 dots
    const total = 8;
    for (let i = 0; i < total; i++) {
      const a = (i / total) * Math.PI * 2 - Math.PI / 2;
      const x = cx + R * Math.cos(a);
      const y = cy + R * Math.sin(a);
      const isDown = i === 0;
      const isBeat = i % 2 === 0;

      if (isDown) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
      }

      const dotR = isDown ? 5 : isBeat ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);
      ctx.fillStyle = isDown
        ? 'rgba(255,255,255,0.5)'
        : isBeat
          ? 'rgba(255,255,255,0.18)'
          : 'rgba(255,255,255,0.06)';
      ctx.fill();
    }

    // BPM number
    const bpmFontSize = Math.round(dialSize * 0.24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${bpmFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#E8E8EC';
    ctx.fillText(bpm.toFixed(0), cx, cy - dialSize * 0.02);

    // "BPM" label
    ctx.font = `600 ${Math.round(dialSize * 0.045)}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#2E2E34';
    ctx.fillText('BPM', cx, cy + dialSize * 0.1);

    // Meter info
    ctx.font = `500 ${Math.round(dialSize * 0.04)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText('4/4  \u00b7  8ths', cx, cy + dialSize * 0.17);
  }, [dialSize, bpm]);

  return (
    <div className="h-full flex flex-col">
      {/* Header: project context */}
      <div className="flex items-center gap-2 py-2 px-4 shrink-0">
        <span className="text-base">🥁</span>
        <span className="text-sm font-medium text-text-secondary truncate">
          My First Project
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-xs font-mono font-bold text-success">87%</span>
          <span className="text-[9px] text-text-muted">3🔥</span>
        </div>
      </div>

      {/* Dial — fills available space */}
      <div
        ref={dialContainerRef}
        className="flex-1 flex items-center justify-center min-h-0 px-6"
      >
        <canvas
          ref={dialCanvasRef}
          style={{ width: dialSize, height: dialSize, display: 'block' }}
        />
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-2 px-4 pb-1 pt-1 shrink-0">
        {/* +/- row */}
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
                       border-border-subtle bg-bg-surface
                       active:bg-bg-raised active:border-border-emphasis transition-all h-[50px]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className="text-text-secondary">
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </button>
          <button
            className="flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
                       border-border-subtle bg-bg-surface
                       active:bg-bg-raised active:border-border-emphasis transition-all h-[50px]"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className="text-text-secondary">
              <line x1="12" y1="6" x2="12" y2="18" />
              <line x1="6" y1="12" x2="18" y2="12" />
            </svg>
          </button>
        </div>

        {/* START */}
        <button
          className={`w-full rounded-[14px] text-sm font-bold tracking-wider
                      flex items-center justify-center gap-2.5 transition-all h-[52px]
            ${isPlaying
              ? 'bg-bg-raised text-text-primary border border-border-emphasis'
              : 'bg-[rgba(255,255,255,0.85)] text-bg-primary'
            }`}
        >
          {!isPlaying && (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21" />
            </svg>
          )}
          {isPlaying ? 'STOP' : 'START'}
        </button>

        {/* RECORD + TAP */}
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                       border-[1.5px] border-border-subtle bg-bg-surface
                       text-text-secondary text-xs font-bold tracking-wide
                       active:bg-bg-raised transition-all h-[44px]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" className="text-danger" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
            RECORD
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                       border-[1.5px] border-border-subtle bg-bg-surface
                       text-text-secondary text-xs font-bold tracking-wide
                       active:bg-bg-raised transition-all h-[44px]"
          >
            ♩ TAP
          </button>
        </div>

        {/* Pattern row — compact beat cells */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { n: '1', lvl: 3 },
            { n: '2', lvl: 1 },
            { n: '3', lvl: 2 },
            { n: '4', lvl: 1 },
          ].map((b, i) => (
            <div
              key={i}
              className={`h-[34px] rounded-lg flex items-center justify-center
                         font-mono text-xs font-bold cursor-pointer transition-all
                ${b.lvl >= 3
                  ? 'bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] text-[rgba(255,255,255,0.7)]'
                  : b.lvl >= 2
                    ? 'bg-bg-surface border border-border-subtle text-[rgba(255,255,255,0.35)]'
                    : 'bg-bg-surface border border-border-subtle text-text-muted'
                }`}
            >
              {b.n}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spacing for settings handle */}
      <div className="h-1 shrink-0" />
    </div>
  );
}
