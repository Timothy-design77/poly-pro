import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger' | 'success';

/**
 * Inline message. Errors announce as alerts, everything else politely.
 */
export function Notice({ tone = 'info', className = '', children }: { tone?: Tone; className?: string; children: ReactNode }) {
  const role = tone === 'danger' ? 'alert' : 'status';
  return <div role={role} className={`ui-notice ${tone === 'info' ? '' : `ui-notice-${tone}`} ${className}`}>{children}</div>;
}
