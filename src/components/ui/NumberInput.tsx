import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface NumberInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  initialValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

export function NumberInput({ isOpen, onClose, onSubmit, initialValue, min = 10, max = 400, step = 0.5, label = 'BPM' }: NumberInputProps) {
  const [input, setInput] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const replaceOnType = useRef(true);
  const initialValueRef = useRef(initialValue);
  initialValueRef.current = initialValue;
  const labelId = useId();

  useDialogFocus(dialogRef, isOpen, onClose);

  useEffect(() => {
    if (!isOpen) return;
    setInput(String(initialValueRef.current));
    replaceOnType.current = true;
  }, [isOpen]);

  const handleKey = useCallback((key: string) => {
    const replace = replaceOnType.current;
    replaceOnType.current = false;
    setInput((previous) => {
      if (key === 'backspace') return previous.slice(0, -1);
      const value = replace ? '' : previous;
      if (key === '.') return value.includes('.') ? value : (value || '0') + '.';
      return value.length >= 6 ? value : value + key;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    const value = parseFloat(input);
    if (!Number.isFinite(value) || value < min || value > max) return;
    const stepped = Math.round(Math.max(min, Math.min(max, value)) / step) * step;
    onSubmit(stepped);
    onClose();
  }, [input, min, max, step, onSubmit, onClose]);

  if (!isOpen) return null;
  const parsed = parseFloat(input);
  const isValid = !Number.isNaN(parsed) && parsed >= min && parsed <= max;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

  return createPortal(
    <div data-no-swipe className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-fade-in" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} onKeyDown={(event) => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (/^[0-9.]$/.test(event.key) || event.key === 'Backspace') {
          event.preventDefault(); event.stopPropagation();
          dialogRef.current?.focus();
          handleKey(event.key === 'Backspace' ? 'backspace' : event.key);
        } else if (event.key === 'Enter' && event.target === dialogRef.current) {
          event.preventDefault(); handleSubmit();
        }
      }} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} className="w-full max-w-[400px] bg-bg-surface rounded-t-2xl p-4 pb-safe animate-slide-up outline-none">
        <div className="text-center mb-4">
          <div id={labelId} className="text-text-muted text-xs tracking-wider mb-2">{label}</div>
          <div className="font-mono text-4xl font-semibold text-text-primary min-h-[48px]" aria-live="polite">{input || '—'}</div>
          {input && !isValid && <div className="text-danger text-xs mt-1" role="alert">{parsed < min ? `Min ${min}` : parsed > max ? `Max ${max}` : 'Invalid'}</div>}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3" aria-label="Numeric keypad">
          {keys.map((key) => (
            <button
              type="button"
              data-key={key}
              key={key}
              aria-label={key === 'backspace' ? 'Backspace' : key === '.' ? 'Decimal point' : key}
              onClick={() => handleKey(key)}
              className={`h-[52px] rounded-xl font-mono text-xl font-semibold flex items-center justify-center active:scale-95 ${key === 'backspace' ? 'bg-bg-raised text-text-secondary' : 'bg-bg-primary border border-border-subtle text-text-primary active:bg-bg-raised'}`}
            >
              {key === 'backspace' ? '⌫' : key}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-[48px] rounded-xl bg-bg-raised text-text-secondary text-sm font-semibold">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!isValid} className={`flex-1 h-[48px] rounded-xl text-sm font-semibold ${isValid ? 'bg-accent text-bg-primary' : 'bg-bg-raised text-text-muted cursor-not-allowed'}`}>Set</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
