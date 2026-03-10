import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface NumberInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  /** Called on every valid keystroke for real-time updates (e.g., live BPM change) */
  onLiveChange?: (value: number) => void;
  initialValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

export function NumberInput({
  isOpen,
  onClose,
  onSubmit,
  onLiveChange,
  initialValue,
  min = 20,
  max = 300,
  step = 0.5,
  label = 'BPM',
}: NumberInputProps) {
  const [input, setInput] = useState('');
  const [hasDecimal, setHasDecimal] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setInput(String(initialValue));
      setHasDecimal(String(initialValue).includes('.'));
    }
  }, [isOpen, initialValue]);

  // Fire live change on every valid keystroke
  useEffect(() => {
    if (!isOpen || !onLiveChange) return;
    const parsed = parseFloat(input);
    if (!isNaN(parsed) && parsed >= min && parsed <= max) {
      const stepped = Math.round(parsed / step) * step;
      onLiveChange(stepped);
    }
  }, [input, isOpen, onLiveChange, min, max, step]);

  const handleKey = useCallback((key: string) => {
    if (key === 'backspace') {
      setInput((prev) => {
        const next = prev.slice(0, -1);
        setHasDecimal(next.includes('.'));
        return next || '';
      });
    } else if (key === '.') {
      if (!hasDecimal) {
        setInput((prev) => prev + '.');
        setHasDecimal(true);
      }
    } else {
      // Digit
      setInput((prev) => {
        const next = prev + key;
        // Limit length
        if (next.length > 6) return prev;
        return next;
      });
    }
  }, [hasDecimal]);

  const handleSubmit = useCallback(() => {
    const value = parseFloat(input);
    if (isNaN(value)) return;
    const clamped = Math.max(min, Math.min(max, value));
    const stepped = Math.round(clamped / step) * step;
    onSubmit(stepped);
    onClose();
  }, [input, min, max, step, onSubmit, onClose]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleSubmit]);

  if (!isOpen) return null;

  const parsed = parseFloat(input);
  const isValid = !isNaN(parsed) && parsed >= min && parsed <= max;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] bg-bg-surface rounded-t-2xl p-4 pb-safe animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Display */}
        <div className="text-center mb-4">
          <div className="text-text-muted text-xs tracking-wider uppercase mb-2">{label}</div>
          <div className="font-mono text-4xl font-bold text-text-primary min-h-[48px]">
            {input || '—'}
          </div>
          {input && !isValid && (
            <div className="text-danger text-xs mt-1">
              {parsed < min ? `Min ${min}` : parsed > max ? `Max ${max}` : 'Invalid'}
            </div>
          )}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {keys.map((key) => (
            <button
              key={key}
              onClick={() => handleKey(key)}
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
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : key}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-[48px] rounded-xl bg-bg-raised text-text-secondary text-sm font-bold"
          >
            Cancel
          </button>
          <button
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
    document.body
  );
}
