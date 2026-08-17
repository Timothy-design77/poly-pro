import { useState, useId, useRef, useEffect, type ReactNode } from 'react';
import { HelpTip } from './HelpTip';

interface CollapsibleCardProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  help?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  badge,
  defaultOpen = false,
  help,
  children,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    if (isOpen) content.removeAttribute('inert');
    else content.setAttribute('inert', '');
  }, [isOpen]);

  return (
    <section className="border border-border-subtle rounded-xl overflow-hidden">
      <div className="flex items-stretch bg-bg-surface focus-within:bg-bg-raised transition-colors">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          aria-controls={contentId}
          id={titleId}
          className="min-w-0 flex-1 flex items-center gap-3 px-4 py-3 text-left
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
        >
          <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex-1">
            {title}
          </span>
          {badge && (
            <span
              className={`font-mono text-[11px] text-text-secondary transition-opacity duration-200
                ${isOpen ? 'opacity-0' : 'opacity-100'}`}
            >
              {badge}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={`text-text-secondary transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {help && (
          <div className="flex items-center pr-3">
            <HelpTip text={help} label={`Help for ${title}`} />
          </div>
        )}
      </div>

      <div
        ref={contentRef}
        id={contentId}
        role="region"
        aria-labelledby={titleId}
        aria-hidden={!isOpen}
        className={`collapse-grid ${isOpen ? 'is-open' : ''}`}
      >
        <div className="collapse-inner">
          <div className="px-4 py-3 border-t border-border-subtle bg-bg-primary">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
