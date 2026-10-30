import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpTip } from './HelpTip';

interface CollapsibleCardProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  help?: string;
  icon?: ReactNode;
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
  icon,
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
    <div className="settings-section" data-open={isOpen || undefined}>
      <div className="flex items-center">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="settings-section-toggle flex-1 min-w-0 flex items-center gap-3 active:bg-bg-raised text-left"
      >
        {icon && <span aria-hidden="true" className="text-text-muted">{icon}</span>}
        <span className="text-sm font-semibold text-text-primary flex-1 flex items-center gap-1.5 min-w-0">
          <span className="truncate">{title}</span>
        </span>
        {badge && (
          <span className="font-mono text-xs text-text-muted shrink-0">
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
      </div>

      {isOpen && (
        <div id={contentId} className="settings-section-content">
          {renderContent && (
            <div className="px-3 pb-4 pt-1">
              {(help || onReset) && (
                <div className="flex items-center justify-end gap-3 -mt-1 mb-1">
                  {help && <HelpTip text={help} />}
                  {onReset && (
                    <button
                      type="button"
                      onClick={onReset}
                      className="ui-button ui-button-quiet px-3 text-xs"
                      aria-label={`${resetLabel} ${title}`}
                    >
                      {resetLabel}
                    </button>
                  )}
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
