import { useCallback, useRef } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { useMetronome } from '../../hooks/useMetronome';

/**
 * Fires on primary pointer-down so the
 * transport responds at finger contact rather than release.
 */
export function PlayButton({ disabled = false }: { disabled?: boolean }) {
  const playing = useMetronomeStore((s) => s.playing);
  const { togglePlay } = useMetronome();
  const firedRef = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled || !e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    firedRef.current = true;
    togglePlay();
  }, [togglePlay, disabled]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (firedRef.current && e.detail !== 0) {
      e.preventDefault();
      firedRef.current = false;
    } else if (!disabled) {
      firedRef.current = false;
      togglePlay();
    }
  }, [togglePlay, disabled]);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={playing ? 'Stop metronome' : 'Start metronome'}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onPointerCancel={() => { firedRef.current = false; }}
      className={`
        w-full min-h-[56px] rounded-xl text-base font-semibold
        flex items-center justify-center gap-3
        touch-manipulation select-none disabled:opacity-50 border-[1.5px]
        ${playing
          ? 'bg-bg-surface text-text-primary border-border-emphasis'
          : 'bg-accent text-bg-primary border-accent'
        }
      `}
    >
      {playing ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21" />
        </svg>
      )}
      {playing ? 'Stop' : 'Start'}
    </button>
  );
}
