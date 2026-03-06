import { useRef, useCallback, useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { clampBpm } from '../../utils/timing';
import { TAP_MIN_TAPS, TAP_MAX_TAPS, TAP_TIMEOUT_MS } from '../../utils/constants';

/**
 * Tap Tempo button.
 * 3-8 taps, 3s timeout between taps, computes average interval.
 * Shows tap count while tapping.
 */
export function TapTempo() {
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleTap = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;

    // Reset if timeout expired
    if (taps.length > 0 && now - taps[taps.length - 1] > TAP_TIMEOUT_MS) {
      tapTimesRef.current = [];
    }

    // Add tap
    tapTimesRef.current.push(now);

    // Limit taps
    if (tapTimesRef.current.length > TAP_MAX_TAPS) {
      tapTimesRef.current = tapTimesRef.current.slice(-TAP_MAX_TAPS);
    }

    const count = tapTimesRef.current.length;
    setTapCount(count);

    // Calculate BPM if enough taps
    if (count >= TAP_MIN_TAPS) {
      const intervals: number[] = [];
      for (let i = 1; i < count; i++) {
        intervals.push(tapTimesRef.current[i] - tapTimesRef.current[i - 1]);
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = 60000 / avgInterval;
      setBpm(clampBpm(bpm));
    }

    // Reset timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setTapCount(0);
      tapTimesRef.current = [];
    }, TAP_TIMEOUT_MS);
  }, [setBpm]);

  return (
    <button
      onClick={handleTap}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                 border-[1.5px] border-border-subtle bg-bg-surface
                 text-text-secondary text-xs font-bold tracking-wide
                 active:bg-bg-raised transition-all h-[44px]
                 touch-manipulation select-none relative"
    >
      ♩ TAP
      {tapCount >= 2 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full
                         bg-[rgba(255,255,255,0.15)] text-[9px] font-mono
                         flex items-center justify-center text-text-secondary">
          {tapCount}
        </span>
      )}
    </button>
  );
}
