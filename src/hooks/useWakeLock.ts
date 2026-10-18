import { useEffect } from 'react';
import { useMetronomeStore } from '../store/metronome-store';

/** Own one practice session's lock, including requests that outlive the session. */
export function holdScreenWakeLock(): () => void {
  if (!('wakeLock' in navigator)) return () => {};
  let active = true;
  let pending = false;
  let sentinel: WakeLockSentinel | null = null;

  const release = () => {
    const previous = sentinel;
    sentinel = null;
    if (previous && !previous.released) void previous.release().catch(() => {});
  };

  const acquire = async () => {
    if (!active || pending || (sentinel && !sentinel.released) || document.visibilityState !== 'visible') return;
    pending = true;
    try {
      const granted = await navigator.wakeLock.request('screen');
      if (!active || document.visibilityState !== 'visible') {
        // Cleanup may have run while the browser was deciding the request.
        void granted.release().catch(() => {});
        return;
      }
      sentinel = granted;
      granted.addEventListener('release', () => {
        if (sentinel === granted) sentinel = null;
      }, { once: true });
    } catch {
      // Low battery, browser policy, or a hidden page can deny this convenience.
    } finally {
      pending = false;
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') void acquire();
    else release();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  void acquire();

  return () => {
    active = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    release();
  };
}

/** Keep the screen awake during audible or silent metronome practice. */
export function useWakeLock() {
  const playing = useMetronomeStore((s) => s.playing);
  useEffect(() => playing ? holdScreenWakeLock() : undefined, [playing]);
}
