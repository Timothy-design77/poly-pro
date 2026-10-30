import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger' | 'success';

/**
 * Inline message. Errors announce as alerts, everything else politely.
 * Pass `live={false}` for static explanatory text.
 */
export function Notice({ tone = 'info', live = true, className = '', children }: { tone?: Tone; live?: boolean; className?: string; children: ReactNode }) {
  const role = !live ? undefined : tone === 'danger' ? 'alert' : 'status';
  return <div role={role} className={`ui-notice ${tone === 'info' ? '' : `ui-notice-${tone}`} ${className}`}>{children}</div>;
}
