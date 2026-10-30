// Screens and sections that load on demand. Prefetching them while the app is
// idle removes the first-open delay without growing the startup bundle.
export const loadPracticeSections = () => import('../components/metronome/PracticeSections');
export const loadSettings = () => import('../components/settings/SettingsOverlay');
export const loadSessionDetail = () => import('../pages/SessionDetailPage');

export function prefetchDeferredUi() {
  const run = () => {
    for (const load of [loadPracticeSections, loadSessionDetail, loadSettings]) {
      load().catch(() => { /* offline or evicted: loads again on demand */ });
    }
  };
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(run, { timeout: 4000 }); else window.setTimeout(run, 1500);
}
