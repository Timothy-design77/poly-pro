import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

/**
 * Fast collapsible surface for mobile.
 *
 * Heavy children are unmounted while closed so hidden controls do not keep
 * subscribing/rendering in the background. On open, the chevron responds
 * synchronously and the child tree mounts on the next animation frame. This
 * avoids the expensive 250ms height animation that caused visible lag on
 * complex sections such as Pattern.
 */
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
  const [renderContent, setRenderContent] = useState(defaultOpen);
  const contentId = useId();
  const frameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const toggle = () => {
    if (isOpen) {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      setRenderContent(false);
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setRenderContent(true);
    });
  };

  return (
    <div className="border border-border-subtle rounded-xl overflow-hidden bg-bg-surface">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="w-full min-h-[48px] flex items-center gap-3 px-4 py-3 active:bg-bg-raised transition-colors duration-75 text-left"
      >
        <span className="text-xs font-bold text-text-secondary uppercase tracking-wider flex-1 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{title}</span>
          {help && <HelpTip text={help} />}
        </span>
        {badge && (
          <span className="font-mono text-[11px] text-text-muted shrink-0">
            {badge}
          </span>
        )}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`text-text-muted transition-transform duration-100 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div id={contentId} className="border-t border-border-subtle bg-bg-primary">
          {renderContent && (
            <div className="px-4 py-3">
              {onReset && (
                <div className="flex justify-end mb-2">
                  <button
                    type="button"
                    onClick={onReset}
                    className="min-h-[32px] rounded-md px-2.5 text-[10px] font-semibold text-text-muted active:bg-bg-raised active:text-text-primary"
                    aria-label={`${resetLabel} ${title}`}
                  >
                    {resetLabel}
                  </button>
                </div>
              )}
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
