/**
 * HelpTip — contextual help icon.
 *
 * Small "?" circle that shows/hides an explanation on tap.
 * Tooltip rendered via Portal at document.body to avoid clipping
 * from parent overflow:hidden containers.
 * Auto-positions: prefers below the button, flips above if no room.
 * Stays within screen bounds horizontally.
 */

import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  text: string;
  children?: React.ReactNode;
}

export function HelpTip({ text, children }: Props) {
  const tooltipId = useId();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, above: false });

  // Position tooltip relative to button
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
      setOpen(false);
      return;
    }
    const tipW = 224; // w-56 = 14rem = 224px
    const margin = 16;

    // Horizontal: center on button, clamp to screen
    let x = rect.left + rect.width / 2 - tipW / 2;
    x = Math.max(margin, Math.min(window.innerWidth - tipW - margin, x));

    // Vertical: prefer below, flip above if < 120px room below
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 120;
    const y = above ? rect.top - 8 : rect.bottom + 6;

    setPos({ x, y, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    // Close on outside tap
    const handler = (e: TouchEvent | MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        tooltipRef.current && !tooltipRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    // Focusing a button can scroll its panel after the click. Keep help anchored
    // instead of immediately dismissing it on narrow screens.
    window.addEventListener('scroll', updatePosition, { capture: true, passive: true });
    window.addEventListener('resize', updatePosition);

    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', updatePosition, { capture: true });
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(!open); }}
        onKeyDown={(event) => {
          if (open && event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onBlur={() => setOpen(false)}
        className="w-6 h-6 rounded-full flex items-center justify-center
                   text-[9px] font-bold touch-manipulation select-none shrink-0
                   bg-[rgba(21,23,26,0.06)] text-text-muted
                   active:bg-[rgba(21,23,26,0.12)]"
        aria-label="Help"
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        type="button"
      >
        ?
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="fixed z-[60] w-56 bg-bg-raised border border-border-emphasis rounded-lg p-2.5 shadow-lg"
          style={{
            left: pos.x,
            top: pos.above ? undefined : pos.y,
            bottom: pos.above ? `${window.innerHeight - pos.y}px` : undefined,
          }}
        >
          <p className="text-[11px] text-text-secondary leading-relaxed">
            {text}
          </p>
          {children && (
            <div className="mt-1.5 text-[10px] text-text-muted leading-relaxed">
              {children}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
