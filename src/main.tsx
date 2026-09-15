import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { audioEngine } from './audio';
import { isCriticalActivityActive, subscribeCriticalActivities } from './utils/critical-activity';
import './styles/globals.css';

// Service-worker updates are deliberately activation-gated. A new build may
// download while the app is busy, but it cannot reload the page in the middle
// of a recording, analysis, calibration, or backup/import operation.
let pendingRefresh = false;
let registration: ServiceWorkerRegistration | undefined;
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;

const activatePendingUpdate = () => {
  if (!pendingRefresh || isCriticalActivityActive() || !updateSW) return;
  pendingRefresh = false;
  window.dispatchEvent(new CustomEvent('polypro:update-activating'));
  updateSW(true).catch((error) => console.warn('App update activation failed:', error));
};

updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, reg) {
    registration = reg;
  },
  onNeedRefresh() {
    pendingRefresh = true;
    activatePendingUpdate();
  },
  onRegisterError(error) {
    console.warn('Service worker registration failed:', error);
  },
});

subscribeCriticalActivities((active) => {
  if (active.size === 0) activatePendingUpdate();
});

const checkForUpdate = () => {
  registration?.update().catch(() => {});
};
window.addEventListener('focus', checkForUpdate);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});

// Warm Web Audio on the first real user gesture so START can schedule in the
// same interaction stack instead of waiting for context creation/sample loads.
let audioWarmedUp = false;
const warmUpAudio = () => {
  if (audioWarmedUp) return;
  audioWarmedUp = true;
  audioEngine.warmUp();
  document.removeEventListener('touchstart', warmUpAudio);
  document.removeEventListener('pointerdown', warmUpAudio);
  document.removeEventListener('click', warmUpAudio);
};
document.addEventListener('touchstart', warmUpAudio, { once: true, passive: true });
document.addEventListener('pointerdown', warmUpAudio, { once: true });
document.addEventListener('click', warmUpAudio, { once: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
