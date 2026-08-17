import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { audioEngine } from './audio';
import { initializeUpdateCoordinator } from './utils/updateCoordinator';
import './styles/globals.css';

// Prevent native long-press context menus on app-owned controls while retaining
// normal browser behavior for editable text and links.
document.addEventListener('contextmenu', (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, [contenteditable="true"], a')) return;
  event.preventDefault();
});

window.addEventListener('load', () => {
  void initializeUpdateCoordinator();
}, { once: true });

// Web Audio must be initialized from a user gesture. Warm the singleton once,
// then remove all alternate gesture listeners through the shared guard.
let audioWarmedUp = false;
const warmUpAudio = () => {
  if (audioWarmedUp) return;
  audioWarmedUp = true;
  void audioEngine.warmUp();
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
