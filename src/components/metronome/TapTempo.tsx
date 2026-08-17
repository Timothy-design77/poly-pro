import { useRef, useCallback, useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { clampBpm } from '../../utils/timing';
import { TAP_MIN_TAPS, TAP_MAX_TAPS, TAP_TIMEOUT_MS } from '../../utils/constants';

export function TapTempo() {
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const firedRef = useRef(false);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_TIMEOUT_MS) {
      tapTimesRef.current = [];
    }

    tapTimesRef.current.push(now);
    if (tapTimesRef.current.length > TAP_MAX_TAPS) {
      tapTimesRef.current = tapTimesRef.current.slice(-TAP_MAX_TAPS);
    }

    const count = tapTimesRef.current.length;
    setTapCount(count);

    if (count >= TAP_MIN_TAPS) {
      const intervals: number[] = [];
      for (let i = 1; i < count; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(clampBpm(60000 / avgInterval));
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTapCount(0);
      tapTimesRef.current = [];
    }, TAP_TIMEOUT_MS);
  }, [setBpm]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    event.preventDefault();
    firedRef.current = true;
    handleTap();
  }, [handleTap]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (firedRef.current) {
      event.preventDefault();
      firedRef.current = false;
      return;
    }
    handleTap();
  }, [handleTap]);

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="w-full min-h-[72px] flex items-center justify-center gap-2 rounded-[18px]
                 border-[1.5px] border-border-subtle bg-bg-surface
                 text-text-primary text-sm font-extrabold tracking-[0.10em]
                 active:bg-bg-raised transition-colors duration-75
                 touch-manipulation select-none relative"
    >
      ♩ TAP TEMPO
      {tapCount >= 2 && (
        <span className="absolute top-2 right-2 min-w-6 h-6 px-1.5 rounded-full
                         bg-accent-dim text-[10px] font-mono font-bold
                         flex items-center justify-center text-text-primary border border-border-subtle">
          {tapCount}
        </span>
      )}
    </button>
  );
}
