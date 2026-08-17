import { useRef, useCallback, useState, useEffect } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { clampBpm } from '../../utils/timing';
import { TAP_MIN_TAPS, TAP_MAX_TAPS, TAP_TIMEOUT_MS } from '../../utils/constants';

export function TapTempo() {
  const setBpm = useMetronomeStore((state) => state.setBpm);
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

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
      for (let index = 1; index < count; index += 1) {
        intervals.push(tapTimesRef.current[index] - tapTimesRef.current[index - 1]);
      }
      const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
      setBpm(clampBpm(60_000 / averageInterval));
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTapCount(0);
      tapTimesRef.current = [];
      timeoutRef.current = null;
    }, TAP_TIMEOUT_MS);
  }, [setBpm]);

  return (
    <button
      type="button"
      onClick={handleTap}
      aria-label={`Tap tempo${tapCount > 0 ? `. ${tapCount} taps entered.` : ''}`}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                 border-[1.5px] border-border-subtle bg-bg-surface
                 text-text-secondary text-xs font-bold tracking-wide
                 active:bg-bg-raised transition-all h-[44px]
                 touch-manipulation select-none relative
                 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span aria-hidden="true">♩</span> TAP
      {tapCount >= 2 && (
        <span
          className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full
                     bg-[rgba(255,255,255,0.20)] text-[10px] font-mono
                     flex items-center justify-center text-text-primary"
          aria-live="polite"
        >
          {tapCount}
        </span>
      )}
    </button>
  );
}
