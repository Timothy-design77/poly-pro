import type { ReactNode } from 'react';

/** Label (and optional description) on the left, a value or control on the right. */
export function SettingRow({ label, description, children, className = '' }: { label: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`ui-row ${className}`}>
      <div className="ui-row-text">
        <div className="ui-row-label">{label}</div>
        {description && <div className="ui-row-desc">{description}</div>}
      </div>
      {children}
    </div>
  );
}
