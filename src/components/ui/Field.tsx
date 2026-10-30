import type { ReactNode } from 'react';

/** Visible label, control and optional hint. The label element names the control. */
export function Field({ label, hint, className = '', children }: { label: ReactNode; hint?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <label className={`ui-field ${className}`}>
      <span className="ui-label">{label}</span>
      {children}
      {hint && <span className="ui-hint">{hint}</span>}
    </label>
  );
}
