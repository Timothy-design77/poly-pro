import { useEffect, useRef } from 'react';
import { useMetronomeStore } from '../store/metronome-store';

/**
 * Acquires a screen wake lock while the metronome is playing.
 * Releases on stop or unmount.
 */
export function useWakeLock() {
  const playing = useMetronomeStore((s) => s.playing);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch {
        // Wake lock request failed — not critical
      }
    };

    const release = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // Already released
        }
        wakeLockRef.current = null;
      }
    };

    if (playing) {
      acquire();
    } else {
      release();
    }

    // Re-acquire on visibility change (e.g., after screen lock)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && playing) {
        acquire();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      release();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [playing]);
}
