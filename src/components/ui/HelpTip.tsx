/**
 * HelpTip — contextual help icon.
 *
 * Small "?" circle that shows/hides an explanation on tap.
 * Inline (next to labels) or standalone.
 */

import { useState, useRef, useEffect } from 'react';

interface Props {
  text: string;
  /** Optional multi-line content */
  children?: React.ReactNode;
}

export function HelpTip({ text, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside tap
  useEffect(() => {
    if (!open) return;
    const handler = (e: TouchEvent | MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="w-[16px] h-[16px] rounded-full flex items-center justify-center
                   text-[9px] font-bold touch-manipulation select-none shrink-0
                   bg-[rgba(255,255,255,0.06)] text-text-muted
                   active:bg-[rgba(255,255,255,0.12)]"
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <div
          className="absolute z-40 left-1/2 -translate-x-1/2 top-6 w-56
                     bg-bg-raised border border-border-emphasis rounded-lg
                     p-2.5 shadow-lg"
          style={{ maxWidth: 'calc(100vw - 32px)' }}
        >
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {text}
          </p>
          {children && (
            <div className="mt-1.5 text-[10px] text-text-muted leading-relaxed">
              {children}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
