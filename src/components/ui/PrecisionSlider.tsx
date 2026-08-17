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

  const fraction = max === min ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));

  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (isEditing || !trackRef.current) return;

    touchIdRef.current = event.pointerId;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    startValueRef.current = value;
    directionRef.current = null;
    activeRef.current = false;
    setPrecisionLevel(1);

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    beginControlDrag();
    lockHeldRef.current = true;
  }, [value, isEditing]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    const dx = event.clientX - startXRef.current;
    const dy = event.clientY - startYRef.current;

    if (directionRef.current === null) {
      const distance = Math.hypot(dx, dy);
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
      const t = Math.min(1, (verticalOffset - PRECISION_START_PX) / (MAX_PRECISION_PX - PRECISION_START_PX));
      sensitivity = 1 - t * (1 - MIN_SENSITIVITY);
    }
    setPrecisionLevel(sensitivity);

    const width = trackWidth.current || 200;
    const newValue = clampAndStep(startValueRef.current + (dx / width) * (max - min) * sensitivity);
    if (newValue !== value) onChange(newValue);
  }, [min, max, value, onChange, clampAndStep]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (touchIdRef.current !== event.pointerId) return;

    if (directionRef.current === null && !activeRef.current) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) {
        const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        onChange(clampAndStep(min + frac * (max - min)));
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
    const parsed = parseFloat(editText);
    if (!Number.isNaN(parsed)) onChange(clampAndStep(parsed));
    setIsEditing(false);
  }, [editText, onChange, clampAndStep]);

  const handleEditKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') handleEditSubmit();
    if (event.key === 'Escape') setIsEditing(false);
  }, [handleEditSubmit]);

  const displayValue = formatValue ? formatValue(value) : (
    step < 1 ? value.toFixed(String(step).split('.')[1]?.length || 1) : String(value)
  );

  return (
    <div data-no-swipe className={`space-y-1 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2">
          {label && <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>}
          {showValue && !isEditing && (
            <button
              type="button"
              onClick={handleValueTap}
              className="font-mono text-xs text-text-primary px-2 py-1 rounded-md border border-transparent
                         active:bg-bg-raised active:border-border-subtle transition-colors min-h-[32px] flex items-center"
            >
              {displayValue}{unit && <span className="text-text-muted ml-0.5">{unit}</span>}
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-1">
              <input
                type="number"
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
        data-no-swipe
        className="relative h-10 flex items-center select-none"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          className="absolute inset-x-0 h-2 rounded-full overflow-hidden bg-bg-raised border border-border-subtle"
          style={{ top: '50%', transform: 'translateY(-50%)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-none bg-accent"
            style={{ width: `${fraction * 100}%`, opacity: isDragging ? 0.8 : 0.55 }}
          />
        </div>

        <div
          className="absolute w-5 h-5 rounded-full bg-accent border-2 border-bg-surface shadow-sm transition-transform"
          style={{
            left: `calc(${fraction * 100}% - 10px)`,
            top: '50%',
            transform: `translateY(-50%) scale(${isDragging ? 1.2 : 1})`,
          }}
        />

        {isDragging && precisionLevel < 0.8 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 text-[8px] text-text-primary font-mono pointer-events-none"
            style={{ top: -12 }}
          >
            {precisionLevel < 0.3 ? '10×' : precisionLevel < 0.6 ? '4×' : '2×'} fine
          </div>
        )}
      </div>
    </div>
  );
}
