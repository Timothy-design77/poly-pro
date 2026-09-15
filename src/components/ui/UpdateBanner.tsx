import { useEffect, useState } from 'react';

export function UpdateBanner() {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handle = () => setUpdating(true);
    window.addEventListener('polypro:update-activating', handle);
    return () => window.removeEventListener('polypro:update-activating', handle);
  }, []);

  if (!updating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-success/90 px-4 py-2 text-center" role="status" aria-live="polite">
      <p className="text-bg-primary text-xs font-medium">Updating to new version…</p>
    </div>
  );
}
