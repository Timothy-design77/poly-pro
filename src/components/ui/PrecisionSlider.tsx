/**
 * PrecisionSlider — scroll-safe slider with vertical-offset fine control and
 * tap-to-type exact numeric entry.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { beginControlDrag, endControlDrag } from '../../utils/gesture-lock';

interface Props {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  showValue?: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
  unit?: string;
}

const DIRECTION_LOCK_PX = 10;
const PRECISION_START_PX = 30;
const MAX_PRECISION_PX = 100;
const MIN_SENSITIVITY = 0.1;

export function PrecisionSlider({
  min,
  max,
  step,
  value,
  onChange,
  formatValue,
  showValue = false,
  label,
  ariaLabel,
  className = '',
  unit = '',
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const valueButtonRef = useRef<HTMLButtonElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [precisionLevel, setPrecisionLevel] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const touchIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startValueRef = useRef(value);
  const directionRef = useRef<'h' | null>(null);
  const trackWidth = useRef(0);
  const lockHeldRef = useRef(false);

  useEffect(() => () => {
    if (lockHeldRef.current) {
      endControlDrag();
      lockHeldRef.current = false;
    }
  }, []);

  const clampAndStep = useCallback((raw: number): number => {
    const clamped = Math.max(min, Math.min(max, raw));
    const steps = Math.round((clamped - min) / step);
    return Math.round((min + steps * step) * 1e10) / 1e10;
  }, [min, max, step]);

  const fraction = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (isEditing || !trackRef.current || !event.isPrimary || event.button !== 0 || touchIdRef.current !== null) return;

    touchIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startValueRef.current = value;
    directionRef.current = null;
    setPrecisionLevel(1);

    trackWidth.current = trackRef.current.clientWidth;
    event.currentTarget.setPointerCapture(event.pointerId);
    beginControlDrag();
    lockHeldRef.current = true;
  }, [value, isEditing]);

  const finishPointer = useCallback(() => {
    touchIdRef.current = null;
    directionRef.current = null;
    setIsDragging(false);
    setPrecisionLevel(1);
    if (lockHeldRef.current) {
      endControlDrag();
      lockHeldRef.current = false;
    }
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;

    if (directionRef.current === null) {
      const distance = Math.hypot(dx, dy);
      if (distance < DIRECTION_LOCK_PX) return;

      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        finishPointer();
        return;
      }

      directionRef.current = 'h';
      setIsDragging(true);
    }

    if (directionRef.current !== 'h') return;

    const verticalOffset = Math.abs(dy);
    let sensitivity = 1;
    if (verticalOffset > PRECISION_START_PX) {
      const t = Math.min(1, (verticalOffset - PRECISION_START_PX) / (MAX_PRECISION_PX - PRECISION_START_PX));
      sensitivity = 1 - t * (1 - MIN_SENSITIVITY);
    }
    setPrecisionLevel(sensitivity);

    const width = trackWidth.current || 200;
    const newValue = clampAndStep(startValueRef.current + (dx / width) * (max - min) * sensitivity);
    if (newValue !== value) onChange(newValue);
  }, [min, max, value, onChange, clampAndStep, finishPointer]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    if (directionRef.current === null) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) {
        const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onChange(clampAndStep(min + frac * (max - min)));
      }
    }

    finishPointer();
  }, [min, max, onChange, clampAndStep, finishPointer]);

  const handleValueTap = useCallback(() => {
    setEditText(String(value));
    setIsEditing(true);
  }, [value]);

  const handleEditSubmit = useCallback(() => {
    const parsed = parseFloat(editText);
    if (!Number.isNaN(parsed)) onChange(clampAndStep(parsed));
    setIsEditing(false);
  }, [editText, onChange, clampAndStep]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter') handleEditSubmit();
    else setIsEditing(false);
    requestAnimationFrame(() => valueButtonRef.current?.focus());
  }, [handleEditSubmit]);

  const displayValue = formatValue ? formatValue(value) : (
    step < 1 ? value.toFixed(String(step).split('.')[1]?.length || 1) : String(value)
  );

  return (
    <div data-no-swipe className={`space-y-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2">
          {label && <span className="ui-label">{label}</span>}
          {showValue && !isEditing && (
            <button
              ref={valueButtonRef}
              type="button"
              aria-label={`Edit ${ariaLabel ?? label ?? 'value'}`}
              onClick={handleValueTap}
              className="ml-auto font-mono text-sm text-text-primary px-2 -mr-2 rounded-md border border-transparent
                         active:bg-bg-raised active:border-border-subtle transition-colors min-h-[44px] min-w-[44px] flex items-center justify-end"
            >
              {displayValue}{unit && !formatValue && <span className="text-text-muted ml-0.5">{unit}</span>}
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label={ariaLabel ?? label ?? 'Value'}
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                step={step}
                min={min}
                max={max}
                className="w-24 px-2 py-1 bg-bg-input border border-accent rounded-md text-xs
                           font-mono text-text-primary text-right outline-none"
              />
              {unit && <span className="text-text-muted text-xs">{unit}</span>}
            </div>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={ariaLabel ?? label ?? 'Value'}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={displayValue}
        onKeyDown={(event) => {
          const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
          if (direction || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            onChange(clampAndStep(event.key === 'Home' ? min : event.key === 'End' ? max : value + direction * step));
          }
        }}
        data-no-swipe
        className="relative h-10 flex items-center select-none"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(event) => { if (touchIdRef.current === event.pointerId) finishPointer(); }}
        onLostPointerCapture={(event) => { if (touchIdRef.current === event.pointerId) finishPointer(); }}
      >
        <div
          className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden bg-bg-raised shadow-[inset_0_0_0_1px_var(--border-subtle)]"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-none bg-accent"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>

        <div
          className="absolute w-[22px] h-[22px] rounded-full bg-accent border-2 border-bg-surface shadow-[0_0_0_1px_var(--accent)] transition-transform"
          style={{
            left: `calc(${fraction * 100}% - 11px)`,
            top: '50%',
            transform: `translateY(-50%) scale(${isDragging ? 1.2 : 1})`,
          }}
        />

        {isDragging && precisionLevel < 0.8 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-[11px] text-text-primary font-mono pointer-events-none"
            style={{ top: -14 }}
          >
            {precisionLevel < 0.3 ? '10×' : precisionLevel < 0.6 ? '4×' : '2×'} fine
          </div>
        )}
      </div>
    </div>
  );
}
