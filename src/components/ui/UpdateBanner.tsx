/**
 * UpdateBanner — Phase 10
 *
 * Listens for service worker updates and shows a brief notification
 * before the page reloads with the new version.
 */

import { useState, useEffect } from 'react';

export function UpdateBanner() {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const handleControllerChange = () => {
      setUpdating(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  if (!updating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-success/90 px-4 py-2 text-center">
      <p className="text-bg-primary text-xs font-medium">
        Updating to new version…
      </p>
    </div>
  );
}
