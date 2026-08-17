import { useCallback, useRef } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { useMetronome } from '../../hooks/useMetronome';

/**
 * Oversized full-width START/STOP button.
 *
 * Uses a true 4:1 width-to-height ratio and fires on pointer-down so the
 * transport responds at finger contact rather than release.
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
        w-full aspect-[4/1] rounded-[20px] text-base font-extrabold tracking-[0.14em]
        flex items-center justify-center gap-3
        touch-manipulation select-none border-[1.5px]
        ${playing
          ? 'bg-bg-surface text-text-primary border-border-emphasis'
          : 'bg-accent text-bg-primary border-accent'
        }
      `}
    >
      {playing ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="4" width="5" height="16" rx="1" />
          <rect x="14" y="4" width="5" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21" />
        </svg>
      )}
      {playing ? 'STOP' : 'START'}
    </button>
  );
}
