import { useCallback, useRef } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { useMetronome } from '../../hooks/useMetronome';

export function PlayButton() {
  const playing = useMetronomeStore((state) => state.playing);
  const { togglePlay } = useMetronome();
  const pointerFiredRef = useRef(false);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    pointerFiredRef.current = true;
    togglePlay();
  }, [togglePlay]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (pointerFiredRef.current) {
      event.preventDefault();
      pointerFiredRef.current = false;
      return;
    }
    // Keyboard activation does not produce the pointerdown path.
    togglePlay();
  }, [togglePlay]);

  return (
    <button
      type="button"
      aria-label={playing ? 'Stop metronome' : 'Start metronome'}
      aria-pressed={playing}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={`
        w-full rounded-[14px] text-sm font-bold tracking-wider
        flex items-center justify-center gap-2.5 h-[52px]
        touch-manipulation select-none
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
        ${playing
          ? 'bg-bg-raised text-text-primary border border-border-emphasis'
          : 'bg-[rgba(255,255,255,0.88)] text-bg-primary'
        }
      `}
    >
      {playing ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="5" y="4" width="5" height="16" rx="1" />
          <rect x="14" y="4" width="5" height="16" rx="1" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5 3 19 12 5 21" />
        </svg>
      )}
      {playing ? 'STOP' : 'START'}
    </button>
  );
}
