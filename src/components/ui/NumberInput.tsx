import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';

interface NumberInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: number) => void;
  onLiveChange?: (value: number) => void;
  initialValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

const FOCUSABLE = 'button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NumberInput({ isOpen, onClose, onSubmit, onLiveChange, initialValue, min = 10, max = 400, step = 0.5, label = 'BPM' }: NumberInputProps) {
  const [input, setInput] = useState('');
  const [hasDecimal, setHasDecimal] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const labelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    setInput(String(initialValue));
    setHasDecimal(String(initialValue).includes('.'));
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('button[data-key="1"]')?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, initialValue]);

  useEffect(() => {
    if (!isOpen || !onLiveChange) return;
    const parsed = parseFloat(input);
    if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) onLiveChange(Math.round(parsed / step) * step);
  }, [input, isOpen, onLiveChange, min, max, step]);

  const handleKey = useCallback((key: string) => {
    if (key === 'backspace') {
      setInput((previous) => {
        const next = previous.slice(0, -1);
        setHasDecimal(next.includes('.'));
        return next;
      });
    } else if (key === '.') {
      if (!hasDecimal) {
        setInput((previous) => previous + '.');
        setHasDecimal(true);
      }
    } else {
      setInput((previous) => previous.length >= 6 ? previous : previous + key);
    }
  }, [hasDecimal]);

  const handleSubmit = useCallback(() => {
    const value = parseFloat(input);
    if (Number.isNaN(value)) return;
    const stepped = Math.round(Math.max(min, Math.min(max, value)) / step) * step;
    onSubmit(stepped);
    onClose();
  }, [input, min, max, step, onSubmit, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key === 'Enter') { event.preventDefault(); handleSubmit(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, handleSubmit]);

  if (!isOpen) return null;
  const parsed = parseFloat(input);
  const isValid = !Number.isNaN(parsed) && parsed >= min && parsed <= max;
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'backspace'];

  return createPortal(
    <div data-no-swipe className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-fade-in" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelId} tabIndex={-1} className="w-full max-w-[400px] bg-bg-surface rounded-t-2xl p-4 pb-safe animate-slide-up outline-none">
        <div className="text-center mb-4">
          <div id={labelId} className="text-text-muted text-xs tracking-wider uppercase mb-2">{label}</div>
          <div className="font-mono text-4xl font-bold text-text-primary min-h-[48px]" aria-live="polite">{input || '—'}</div>
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
              className={`h-[52px] rounded-xl font-mono text-xl font-bold flex items-center justify-center active:scale-95 ${key === 'backspace' ? 'bg-bg-raised text-text-secondary' : 'bg-bg-primary border border-border-subtle text-text-primary active:bg-bg-raised'}`}
            >
              {key === 'backspace' ? '⌫' : key}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 h-[48px] rounded-xl bg-bg-raised text-text-secondary text-sm font-bold">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={!isValid} className={`flex-1 h-[48px] rounded-xl text-sm font-bold ${isValid ? 'bg-accent text-bg-primary' : 'bg-bg-raised text-text-muted cursor-not-allowed'}`}>Set</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
