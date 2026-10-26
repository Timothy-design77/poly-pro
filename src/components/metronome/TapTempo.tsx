import { useRef, useCallback, useState, useEffect } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { clampBpm } from '../../utils/timing';
import { TAP_MIN_TAPS, TAP_MAX_TAPS, TAP_TIMEOUT_MS } from '../../utils/constants';

export function TapTempo() {
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const [tapCount, setTapCount] = useState(0);
  const tapTimesRef = useRef<number[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const firedRef = useRef(false);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

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
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    firedRef.current = true;
    handleTap();
  }, [handleTap]);

  const handleClick = useCallback((event: React.MouseEvent) => {
    if (firedRef.current && event.detail !== 0) {
      event.preventDefault();
      firedRef.current = false;
      return;
    }
    firedRef.current = false;
    handleTap();
  }, [handleTap]);

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onPointerCancel={() => { firedRef.current = false; }}
      className="min-h-[48px] w-32 flex items-center justify-center gap-2 rounded-full
                 text-text-secondary text-sm font-medium active:bg-bg-raised touch-manipulation select-none relative"
    >
      Tap tempo
      {tapCount >= 2 && (
        <span aria-hidden="true" className="absolute -top-2 right-1 text-xs font-mono text-text-muted">
          {tapCount}
        </span>
      )}
    </button>
  );
}
