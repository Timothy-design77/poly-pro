import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface NumberInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  /** Called after user edits a valid value for real-time updates (e.g., live BPM change). */
  onLiveChange?: (value: number) => void;
  initialValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

function normalizeSteppedValue(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = Math.max(min, Math.min(max, value));
  // Limit floating-point noise while preserving fractional BPM steps.
  return Number((Math.round(clamped / step) * step).toFixed(6));
}

export function NumberInput({
  isOpen,
  onClose,
  onSubmit,
  onLiveChange,
  initialValue,
  min = 10,
  max = 400,
  step = 0.5,
  label = 'BPM',
}: NumberInputProps) {
  const [input, setInput] = useState('');
  const [hasDecimal, setHasDecimal] = useState(false);
  const initialValueRef = useRef(initialValue);
  const userEditedRef = useRef(false);

  initialValueRef.current = initialValue;

  // Initialize exactly once per open cycle. Previously the live-change effect
  // could run with stale local state during this transition and overwrite a
  // Tap Tempo or externally changed BPM before the new value rendered.
  useEffect(() => {
    if (!isOpen) {
      userEditedRef.current = false;
      return;
    }

    const next = String(initialValueRef.current);
    userEditedRef.current = false;
    setInput(next);
    setHasDecimal(next.includes('.'));
  }, [isOpen]);

  // Publish only user-originated edits. Initialization and prop synchronization
  // must never mutate global tempo state.
  useEffect(() => {
    if (!isOpen || !onLiveChange || !userEditedRef.current) return;

    const parsed = Number.parseFloat(input);
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
      onLiveChange(normalizeSteppedValue(parsed, min, max, step));
    }
  }, [input, isOpen, onLiveChange, min, max, step]);

  const handleKey = useCallback((key: string) => {
    userEditedRef.current = true;

    if (key === 'backspace') {
      setInput((previous) => {
        const next = previous.slice(0, -1);
        setHasDecimal(next.includes('.'));
        return next;
      });
      return;
    }

    if (key === '.') {
      if (!hasDecimal) {
        setInput((previous) => previous + '.');
        setHasDecimal(true);
      }
      return;
    }

    setInput((previous) => {
      const next = previous + key;
      return next.length > 6 ? previous : next;
    });
  }, [hasDecimal]);

  const handleSubmit = useCallback(() => {
    const value = Number.parseFloat(input);
    if (!Number.isFinite(value)) return;

    onSubmit(normalizeSteppedValue(value, min, max, step));
    onClose();
  }, [input, min, max, step, onSubmit, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Enter') handleSubmit();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleSubmit]);

  if (!isOpen) return null;

  const parsed = Number.parseFloat(input);
  const isValid = Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];
  const dialogTitleId = 'number-input-title';

  return createPortal(
    <div
      data-no-swipe
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-fade-in"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[400px] bg-bg-surface rounded-t-2xl p-4 pb-safe animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
      >
        <div className="text-center mb-4">
          <div
            id={dialogTitleId}
            className="text-text-muted text-xs tracking-wider uppercase mb-2"
          >
            {label}
          </div>
          <div
            className="font-mono text-4xl font-bold text-text-primary min-h-[48px]"
            aria-live="polite"
          >
            {input || '—'}
          </div>
          {input && !isValid && (
            <div className="text-danger text-xs mt-1" role="alert">
              {parsed < min ? `Min ${min}` : parsed > max ? `Max ${max}` : 'Invalid'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3" aria-label={`${label} keypad`}>
          {keys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleKey(key)}
              aria-label={key === 'backspace' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
              className={`
                h-[52px] rounded-xl font-mono text-xl font-bold
                flex items-center justify-center
                transition-all active:scale-95
                ${key === 'backspace'
                  ? 'bg-bg-raised text-text-secondary'
                  : 'bg-bg-primary border border-border-subtle text-text-primary active:bg-bg-raised'
                }
              `}
            >
              {key === 'backspace' ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : key}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-[48px] rounded-xl bg-bg-raised text-text-secondary text-sm font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className={`
              flex-1 h-[48px] rounded-xl text-sm font-bold transition-all
              ${isValid
                ? 'bg-[rgba(255,255,255,0.85)] text-bg-primary'
                : 'bg-bg-raised text-text-muted cursor-not-allowed'
              }
            `}
          >
            Set
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
