import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  confirmDanger?: boolean;
  onConfirm?: () => void;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  confirmLabel,
  confirmDanger = false,
  onConfirm,
}: ModalProps) {
  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-[2px] px-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[340px] bg-bg-surface rounded-2xl p-5 animate-modal-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-text-primary mb-2">{title}</h3>
        <div className="text-sm text-text-secondary mb-5">{children}</div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-[44px] rounded-xl bg-bg-raised text-text-secondary
                       text-sm font-bold active:bg-bg-surface touch-manipulation
                       transition-transform active:scale-[0.98]"
          >
            Cancel
          </button>
          {onConfirm && (
            <button
              onClick={() => { onConfirm(); onClose(); }}
              className={`flex-1 h-[44px] rounded-xl text-sm font-bold touch-manipulation
                transition-transform active:scale-[0.98]
                ${confirmDanger
                  ? 'bg-danger text-white active:bg-danger/80'
                  : 'bg-[rgba(255,255,255,0.85)] text-bg-primary active:bg-[rgba(255,255,255,0.95)]'
                }`}
            >
              {confirmLabel || 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
