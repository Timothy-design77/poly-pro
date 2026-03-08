/**
 * HelpTip — contextual help icon.
 *
 * Small "?" circle that shows/hides an explanation on tap.
 * Tooltip rendered via Portal at document.body to avoid clipping
 * from parent overflow:hidden containers.
 * Auto-positions: prefers below the button, flips above if no room.
 * Stays within screen bounds horizontally.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  text: string;
  children?: React.ReactNode;
}

export function HelpTip({ text, children }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, above: false });

  // Position tooltip relative to button
  const updatePosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
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

    // Close on scroll
    const scrollHandler = () => setOpen(false);

    document.addEventListener('touchstart', handler, { passive: true });
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', scrollHandler, { capture: true, passive: true });

    return () => {
      document.removeEventListener('touchstart', handler);
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', scrollHandler, { capture: true });
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(!open); }}
        className="w-[16px] h-[16px] rounded-full flex items-center justify-center
                   text-[9px] font-bold touch-manipulation select-none shrink-0
                   bg-[rgba(255,255,255,0.06)] text-text-muted
                   active:bg-[rgba(255,255,255,0.12)]"
        aria-label="Help"
        type="button"
      >
        ?
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
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
