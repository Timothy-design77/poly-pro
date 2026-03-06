import { useCallback, useRef } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { useMetronome } from '../../hooks/useMetronome';

/**
 * Full-width START/STOP button.
 *
 * LATENCY: Uses onPointerDown (fires on finger TOUCH, not release).
 * No transition on bg/color — visual state snaps instantly.
 */
export function PlayButton() {
  const playing = useMetronomeStore((s) => s.playing);
  const { togglePlay } = useMetronome();
  const firedRef = useRef(false);

  // Fire on pointer DOWN — instant, no waiting for finger lift
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    firedRef.current = true;
    togglePlay();
  }, [togglePlay]);

  // Prevent click from double-firing after pointerdown
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
    }
  }, []);

  return (
    <button
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`
        w-full rounded-[14px] text-sm font-bold tracking-wider
        flex items-center justify-center gap-2.5 h-[52px]
        touch-manipulation select-none
        ${playing
          ? 'bg-bg-raised text-text-primary border border-border-emphasis'
          : 'bg-[rgba(255,255,255,0.85)] text-bg-primary'
        }
      `}
    >
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="4" width="5" height="16" rx="1" />
          <rect x="14" y="4" width="5" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21" />
        </svg>
      )}
      {playing ? 'STOP' : 'START'}
    </button>
  );
}
