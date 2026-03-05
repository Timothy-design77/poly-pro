import { useState } from 'react';

export function HomePage() {
  const [bpm] = useState(120.0);
  const [isPlaying] = useState(false);

  return (
    <div className="h-full flex flex-col px-4">
      {/* Header: project context */}
      <div className="flex items-center gap-2 py-3">
        <span className="text-base">🥁</span>
        <span className="text-sm font-medium text-text-primary">My First Project</span>
        <span className="text-xs font-mono text-text-muted ml-auto">—%</span>
      </div>

      {/* Dial area with ± buttons */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="flex items-center gap-4 w-full max-w-xs justify-center">
          {/* Minus button */}
          <button
            className="w-14 h-14 rounded-full border border-border-subtle bg-bg-surface
                       flex items-center justify-center text-xl text-text-primary
                       active:bg-bg-raised active:border-border-emphasis transition-all"
          >
            −
          </button>

          {/* Dial placeholder */}
          <div className="relative flex items-center justify-center">
            <div
              className="rounded-full border-2 border-border-subtle flex flex-col items-center justify-center"
              style={{
                width: 'clamp(150px, 55vw, 280px)',
                height: 'clamp(150px, 55vw, 280px)',
              }}
            >
              {/* Beat dots placeholder */}
              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
                const radius = 46;
                return (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full"
                    style={{
                      left: `calc(50% + ${Math.cos(angle) * radius}% - 4px)`,
                      top: `calc(50% + ${Math.sin(angle) * radius}% - 4px)`,
                      backgroundColor:
                        i === 0
                          ? 'rgba(255,255,255,0.85)'
                          : 'rgba(255,255,255,0.15)',
                    }}
                  />
                );
              })}

              {/* BPM display */}
              <span className="font-mono text-3xl font-bold text-text-primary leading-none">
                {bpm.toFixed(1)}
              </span>
              <span className="text-xs text-text-muted mt-1 font-sans">BPM</span>
              <span className="text-[10px] text-text-muted mt-0.5 font-sans">
                4/4 · 8ths
              </span>
            </div>
          </div>

          {/* Plus button */}
          <button
            className="w-14 h-14 rounded-full border border-border-subtle bg-bg-surface
                       flex items-center justify-center text-xl text-text-primary
                       active:bg-bg-raised active:border-border-emphasis transition-all"
          >
            +
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pb-4 pt-2">
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
