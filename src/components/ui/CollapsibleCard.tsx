import { useState, type ReactNode } from 'react';

interface CollapsibleCardProps {
  title: string;
  /** Short summary shown in the header when collapsed (e.g. "4/4 · 8ths") */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Thin header bar that expands into a roomy card.
 * Same UX pattern as Settings sections.
 */
export function CollapsibleCard({ title, badge, defaultOpen = false, children }: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden">
      {/* Header — always visible, tap to toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-bg-surface
                   active:bg-bg-raised transition-colors text-left"
      >
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex-1">
          {title}
        </span>
        {badge && !isOpen && (
          <span className="font-mono text-[11px] text-text-muted">{badge}</span>
        )}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`text-text-muted transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Content — roomy padding, big touch targets */}
      {isOpen && (
        <div className="px-4 py-3 border-t border-border-subtle bg-bg-primary">
          {children}
        </div>
      )}
    </div>
  );
}
