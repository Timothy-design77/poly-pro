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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    firedRef.current = true;
    togglePlay();
  }, [togglePlay]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
    }
  }, []);

  return (
    <button
      type="button"
      aria-label={playing ? 'Stop metronome' : 'Start metronome'}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`
        w-full rounded-[14px] text-sm font-bold tracking-wider
        flex items-center justify-center gap-2.5 h-[54px]
        touch-manipulation select-none border-[1.5px]
        ${playing
          ? 'bg-bg-surface text-text-primary border-border-emphasis'
          : 'bg-accent text-bg-primary border-accent'
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
