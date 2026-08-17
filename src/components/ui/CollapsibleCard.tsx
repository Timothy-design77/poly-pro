import { useState, useId, type ReactNode } from 'react';
import { HelpTip } from './HelpTip';

interface CollapsibleCardProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  help?: string;
  onReset?: () => void;
  resetLabel?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  badge,
  defaultOpen = false,
  help,
  onReset,
  resetLabel = 'Reset',
  children,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-bg-surface">
      <div className="flex items-stretch bg-bg-surface">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 active:bg-bg-raised transition-colors text-left"
        >
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex-1 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{title}</span>
            {help && <HelpTip text={help} />}
          </span>
          {badge && (
            <span
              className={`font-mono text-[11px] text-text-muted transition-opacity duration-200 shrink-0
                ${isOpen ? 'opacity-0' : 'opacity-100'}`}
            >
              {badge}
            </span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            className={`text-text-muted transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 px-3 min-w-[56px] border-l border-border-subtle text-[10px]
                       font-semibold text-text-muted active:bg-bg-raised active:text-text-primary"
            aria-label={`${resetLabel} ${title}`}
          >
            {resetLabel}
          </button>
        )}
      </div>

      <div id={contentId} className={`collapse-grid ${isOpen ? 'is-open' : ''}`}>
        <div className="collapse-inner">
          <div className="px-4 py-3 border-t border-border-subtle bg-bg-primary">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
