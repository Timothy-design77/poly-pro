import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  text: string;
  children?: React.ReactNode;
  label?: string;
}

export function HelpTip({ text, children, label = 'Show help' }: Props) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const [position, setPosition] = useState({ x: 0, y: 0, above: false });

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const tooltipWidth = 224;
    const margin = 16;
    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    x = Math.max(margin, Math.min(window.innerWidth - tooltipWidth - margin, x));
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 120;
    const y = above ? rect.top - 8 : rect.bottom + 6;
    setPosition({ x, y, above });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const outsideHandler = (event: TouchEvent | MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current
        && !buttonRef.current.contains(target)
        && tooltipRef.current
        && !tooltipRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const scrollHandler = () => setOpen(false);
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('touchstart', outsideHandler, { passive: true });
    document.addEventListener('mousedown', outsideHandler);
    document.addEventListener('keydown', keyHandler);
    window.addEventListener('scroll', scrollHandler, { capture: true, passive: true });

    return () => {
      document.removeEventListener('touchstart', outsideHandler);
      document.removeEventListener('mousedown', outsideHandler);
      document.removeEventListener('keydown', keyHandler);
      window.removeEventListener('scroll', scrollHandler, { capture: true });
    };
  }, [open, updatePosition]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="w-[28px] h-[28px] rounded-full flex items-center justify-center
                   text-[11px] font-bold touch-manipulation select-none shrink-0
                   bg-[rgba(255,255,255,0.10)] text-text-secondary
                   active:bg-[rgba(255,255,255,0.18)]
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        aria-label={label}
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
            left: position.x,
            top: position.above ? undefined : position.y,
            bottom: position.above ? `${window.innerHeight - position.y}px` : undefined,
          }}
        >
          <p className="text-[12px] text-text-primary leading-relaxed">
            {text}
          </p>
          {children && (
            <div className="mt-1.5 text-[11px] text-text-secondary leading-relaxed">
              {children}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
