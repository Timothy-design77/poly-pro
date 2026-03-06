import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import './styles/globals.css';

// ─── Block native long-press context menu (Android Chrome) ───
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

// ─── Force service worker updates on every load ───
if ('serviceWorker' in navigator) {
  const checkForUpdate = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch (_) { /* ignore */ }
  };

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();

        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        reg.addEventListener('updatefound', () => {
          const newSW = reg.installing;
          if (!newSW) return;
          newSW.addEventListener('statechange', () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              newSW.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      }

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    } catch (err) {
      console.warn('SW update check failed:', err);
    }
  });

  // Also check when user returns to the app
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
  window.addEventListener('focus', checkForUpdate);
}

import { audioEngine } from './audio/engine';

// ─── Audio warm-up: init AudioContext on first user gesture ───
// Web Audio API requires a user gesture to create/resume a context.
// By warming up on the FIRST touch anywhere in the app, the context
// and all sound buffers are ready before the user ever hits START.
let audioWarmedUp = false;
const warmUpAudio = () => {
  if (audioWarmedUp) return;
  audioWarmedUp = true;
  audioEngine.warmUp();
  // Remove listeners after first trigger
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
