/**
 * PrecisionSlider — custom, touch-friendly slider with direction locking,
 * vertical-offset precision, direct numeric entry, and keyboard semantics.
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
  const [isDragging, setIsDragging] = useState(false);
  const [precisionLevel, setPrecisionLevel] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const touchIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startValueRef = useRef(value);
  const directionRef = useRef<'h' | 'v' | null>(null);
  const activeRef = useRef(false);
  const trackWidth = useRef(0);
  const lockHeldRef = useRef(false);

  useEffect(() => () => {
    if (lockHeldRef.current) {
      endControlDrag();
      lockHeldRef.current = false;
    }
  }, []);

  useEffect(() => {
    const measure = () => {
      if (trackRef.current) trackWidth.current = trackRef.current.clientWidth;
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const clampAndStep = useCallback((raw: number): number => {
    const clamped = Math.max(min, Math.min(max, raw));
    const steps = Math.round((clamped - min) / step);
    return Math.round((min + steps * step) * 1e10) / 1e10;
  }, [min, max, step]);

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (isEditing) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    touchIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startValueRef.current = value;
    directionRef.current = null;
    activeRef.current = false;
    setPrecisionLevel(1);

    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    beginControlDrag();
    lockHeldRef.current = true;
  }, [value, isEditing]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;

    if (directionRef.current === null) {
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < DIRECTION_LOCK_PX) return;

      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        directionRef.current = 'v';
        touchIdRef.current = null;
        if (lockHeldRef.current) {
          endControlDrag();
          lockHeldRef.current = false;
        }
        return;
      }
      directionRef.current = 'h';
      activeRef.current = true;
      setIsDragging(true);
    }

    if (directionRef.current !== 'h') return;

    const verticalOffset = Math.abs(dy);
    let sensitivity = 1;
    if (verticalOffset > PRECISION_START_PX) {
      const interpolation = Math.min(
        1,
        (verticalOffset - PRECISION_START_PX) / (MAX_PRECISION_PX - PRECISION_START_PX),
      );
      sensitivity = 1 - interpolation * (1 - MIN_SENSITIVITY);
    }
    setPrecisionLevel(sensitivity);

    const width = trackWidth.current || 200;
    const valueDelta = (dx / width) * (max - min) * sensitivity;
    const nextValue = clampAndStep(startValueRef.current + valueDelta);
    if (nextValue !== value) onChange(nextValue);
  }, [min, max, value, onChange, clampAndStep]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    if (directionRef.current === null && !activeRef.current) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) {
        const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onChange(clampAndStep(min + fraction * (max - min)));
      }
    }

    touchIdRef.current = null;
    directionRef.current = null;
    activeRef.current = false;
    setIsDragging(false);
    setPrecisionLevel(1);
    if (lockHeldRef.current) {
      endControlDrag();
      lockHeldRef.current = false;
    }
  }, [min, max, onChange, clampAndStep]);

  const handleValueTap = useCallback(() => {
    setEditText(String(value));
    setIsEditing(true);
  }, [value]);

  const handleEditSubmit = useCallback(() => {
    const parsed = Number.parseFloat(editText);
    if (!Number.isNaN(parsed)) onChange(clampAndStep(parsed));
    setIsEditing(false);
  }, [editText, onChange, clampAndStep]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') handleEditSubmit();
    if (event.key === 'Escape') setIsEditing(false);
  }, [handleEditSubmit]);

  const handleSliderKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let nextValue: number | null = null;
    const largeStep = step * 10;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nextValue = value + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        nextValue = value - step;
        break;
      case 'PageUp':
        nextValue = value + largeStep;
        break;
      case 'PageDown':
        nextValue = value - largeStep;
        break;
      case 'Home':
        nextValue = min;
        break;
      case 'End':
        nextValue = max;
        break;
      default:
        return;
    }

    event.preventDefault();
    onChange(clampAndStep(nextValue));
  }, [value, step, min, max, onChange, clampAndStep]);

  const fraction = (value - min) / (max - min);
  const displayValue = formatValue
    ? formatValue(value)
    : step < 1
      ? value.toFixed(String(step).split('.')[1]?.length || 1)
      : String(value);
  const accessibleLabel = ariaLabel || label || 'Precision slider';

  return (
    <div data-no-swipe className={`space-y-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-xs text-text-secondary uppercase tracking-wider">{label}</span>
          )}
          {showValue && !isEditing && (
            <button
              type="button"
              aria-label={`Enter ${accessibleLabel} value`}
              onClick={handleValueTap}
              className="font-mono text-xs text-text-secondary px-1 py-0.5 rounded hover:bg-bg-raised
                         transition-colors min-h-[28px] flex items-center
                         focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {displayValue}{unit && <span className="text-text-secondary ml-0.5">{unit}</span>}
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                aria-label={`${accessibleLabel} value`}
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                step={step}
                min={min}
                max={max}
                className="w-20 px-1.5 py-0.5 bg-bg-primary border border-accent rounded
                           text-xs font-mono text-text-primary text-right outline-none"
              />
              {unit && <span className="text-text-secondary text-xs">{unit}</span>}
            </div>
          )}
        </div>
      )}

      <div
        ref={trackRef}
        data-no-swipe
        role="slider"
        tabIndex={0}
        aria-label={accessibleLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${displayValue}${unit ? ` ${unit}` : ''}`}
        className="relative h-10 flex items-center touch-manipulation select-none
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleSliderKeyDown}
      >
        <div
          className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
          aria-hidden="true"
        >
          <div className="h-full bg-[rgba(255,255,255,0.08)]" />
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-none"
            style={{
              width: `${fraction * 100}%`,
              backgroundColor: isDragging
                ? 'rgba(255,255,255,0.6)'
                : 'rgba(255,255,255,0.35)',
            }}
          />
        </div>

        <div
          aria-hidden="true"
          className="absolute w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
          style={{
            left: `calc(${fraction * 100}% - 10px)`,
            top: '50%',
            transform: `translateY(-50%) scale(${isDragging ? 1.2 : 1})`,
          }}
        />

        {isDragging && precisionLevel < 0.8 && (
          <div
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 text-[8px] text-accent font-mono pointer-events-none"
            style={{ top: -12 }}
          >
            {precisionLevel < 0.3 ? '10×' : precisionLevel < 0.6 ? '4×' : '2×'} fine
          </div>
        )}
      </div>
    </div>
  );
}
