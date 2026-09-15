import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm?: () => void | Promise<void>;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, confirmLabel, confirmDanger = false, onConfirm }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialogRef.current)?.focus();
    });
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] px-6 animate-fade-in" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-[340px] bg-bg-surface rounded-2xl p-5 animate-modal-pop outline-none"
      >
        <h3 id={titleId} className="text-base font-bold text-text-primary mb-2">{title}</h3>
        <div className="text-sm text-text-secondary mb-5">{children}</div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-[44px] rounded-xl bg-bg-raised text-text-secondary text-sm font-bold active:bg-bg-surface">Cancel</button>
          {onConfirm && (
            <button
              type="button"
              onClick={async () => { await onConfirm(); onClose(); }}
              className={`flex-1 h-[44px] rounded-xl text-sm font-bold ${confirmDanger ? 'bg-danger text-white active:bg-danger/80' : 'bg-accent text-bg-primary active:opacity-90'}`}
            >
              {confirmLabel || 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
