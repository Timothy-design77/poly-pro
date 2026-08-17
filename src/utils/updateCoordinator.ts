import {
  getCriticalActivities,
  hasCriticalActivity,
  subscribeToCriticalActivity,
  type CriticalActivity,
} from './appActivity';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'deferred'
  | 'activating'
  | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  blockingActivities: CriticalActivity[];
  message: string | null;
}

type Listener = (state: UpdateState) => void;

const listeners = new Set<Listener>();
let state: UpdateState = {
  phase: 'idle',
  blockingActivities: [],
  message: null,
};
let registration: ServiceWorkerRegistration | null = null;
let waitingWorker: ServiceWorker | null = null;
let initialized = false;
let activationRequested = false;
let reloading = false;
let unsubscribeActivity: (() => void) | null = null;

function publish(next: UpdateState) {
  state = next;
  for (const listener of listeners) listener(state);
}

function refreshAvailabilityState() {
  if (!waitingWorker || state.phase === 'activating') return;
  const blockingActivities = getCriticalActivities();
  publish({
    phase: blockingActivities.length > 0 ? 'deferred' : 'available',
    blockingActivities,
    message: blockingActivities.length > 0
      ? 'An update is ready and will remain paused until current work is complete.'
      : 'A new version of Poly Pro is ready.',
  });
}

function handleInstalledWorker(worker: ServiceWorker) {
  // installed with no controller is the first installation, not an update.
  if (!navigator.serviceWorker.controller) return;
  waitingWorker = worker;
  refreshAvailabilityState();
}

function attachRegistration(nextRegistration: ServiceWorkerRegistration) {
  if (registration === nextRegistration) return;
  registration = nextRegistration;

  if (registration.waiting) handleInstalledWorker(registration.waiting);

  registration.addEventListener('updatefound', () => {
    const installing = registration?.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') handleInstalledWorker(installing);
    });
  });
}

export function getUpdateState(): UpdateState {
  return state;
}

export function subscribeToUpdates(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export async function checkForUpdates(): Promise<void> {
  if (!registration) return;
  if (state.phase === 'idle') {
    publish({ phase: 'checking', blockingActivities: [], message: null });
  }

  try {
    await registration.update();
    if (registration.waiting) handleInstalledWorker(registration.waiting);
    else if (!waitingWorker && state.phase === 'checking') {
      publish({ phase: 'idle', blockingActivities: [], message: null });
    }
  } catch (error) {
    console.warn('[updates] Update check failed:', error);
    if (!waitingWorker) {
      publish({
        phase: 'error',
        blockingActivities: [],
        message: 'Could not check for updates. The current version remains available offline.',
      });
    }
  }
}

export function activateWaitingUpdate(): boolean {
  if (!waitingWorker) return false;

  const blockingActivities = getCriticalActivities();
  if (blockingActivities.length > 0) {
    publish({
      phase: 'deferred',
      blockingActivities,
      message: 'Finish the active recording, analysis, training, or data operation before updating.',
    });
    return false;
  }

  activationRequested = true;
  publish({
    phase: 'activating',
    blockingActivities: [],
    message: 'Applying update…',
  });
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export function dismissUpdateNotice() {
  if (state.phase === 'activating') return;
  publish({ phase: 'idle', blockingActivities: [], message: null });
}

export async function initializeUpdateCoordinator(): Promise<void> {
  if (initialized || !('serviceWorker' in navigator)) return;
  initialized = true;

  unsubscribeActivity = subscribeToCriticalActivity(() => {
    if (waitingWorker) refreshAvailabilityState();
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!activationRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });

  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) attachRegistration(existing);
    else {
      // vite-plugin-pwa registers during page startup. `ready` resolves once
      // the first service worker is active and avoids maintaining a second
      // registration path here.
      const ready = await navigator.serviceWorker.ready;
      attachRegistration(ready);
    }

    await checkForUpdates();
  } catch (error) {
    console.warn('[updates] Coordinator initialization failed:', error);
    publish({
      phase: 'error',
      blockingActivities: [],
      message: 'Update checks are unavailable. The installed app can still be used.',
    });
  }

  const handleVisible = () => {
    if (document.visibilityState === 'visible') void checkForUpdates();
  };
  document.addEventListener('visibilitychange', handleVisible);
  window.addEventListener('focus', checkForUpdates);
}

export function disposeUpdateCoordinator() {
  unsubscribeActivity?.();
  unsubscribeActivity = null;
  listeners.clear();
}

export function isUpdateBlocked(): boolean {
  return hasCriticalActivity();
}
