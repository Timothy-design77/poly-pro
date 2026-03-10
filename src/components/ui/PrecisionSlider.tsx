/**
 * PrecisionSlider — custom slider with:
 *
 * 1. Vertical offset precision: drag finger down from slider track for
 *    finer control. The further down you drag, the less sensitive.
 *    Normal = 1:1 mapping. 40px down = 4× precision. 80px+ = 10× precision.
 *
 * 2. Direction lock: first 10px of touch movement decides if this is a
 *    horizontal slider drag or a vertical scroll. Prevents accidental
 *    slider changes while scrolling.
 *
 * 3. Tap-to-type: tap the value label to open an inline number input.
 *
 * Drop-in replacement for <input type="range">.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  /** Format function for the value display. If omitted, shows raw number. */
  formatValue?: (value: number) => string;
  /** If true, show the value label and make it tappable for direct input */
  showValue?: boolean;
  /** Label text shown to the left of the value */
  label?: string;
  /** Additional class on the outer container */
  className?: string;
  /** Unit suffix for the type-in input (e.g. "ms", "%") */
  unit?: string;
}

const DIRECTION_LOCK_PX = 10;
const PRECISION_START_PX = 30;  // vertical offset where precision kicks in
const MAX_PRECISION_PX = 100;   // vertical offset for maximum precision
const MIN_SENSITIVITY = 0.1;    // at max offset, 10× precision

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
  const [precisionLevel, setPrecisionLevel] = useState(1); // 1 = normal
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');

  // Touch tracking
  const touchIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startValueRef = useRef(value);
  const directionRef = useRef<'h' | 'v' | null>(null);
  const activeRef = useRef(false); // true once direction locked to horizontal

  const trackWidth = useRef(0);

  // Measure track on mount / resize
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
    // Snap to step
    const steps = Math.round((clamped - min) / step);
    return Math.round((min + steps * step) * 1e10) / 1e10; // avoid float drift
  }, [min, max, step]);

  const getFraction = () => (value - min) / (max - min);

  // ─── Pointer events (unified touch + mouse) ───

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (isEditing) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;

    touchIdRef.current = e.pointerId;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    startValueRef.current = value;
    directionRef.current = null;
    activeRef.current = false;
    setPrecisionLevel(1);

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [value, isEditing]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (touchIdRef.current !== e.pointerId) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    // Direction lock
    if (directionRef.current === null) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < DIRECTION_LOCK_PX) return; // not enough movement yet

      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        // Vertical — let scroll happen, release the slider
        directionRef.current = 'v';
        touchIdRef.current = null;
        return;
      }
      directionRef.current = 'h';
      activeRef.current = true;
      setIsDragging(true);
    }

    if (directionRef.current !== 'h') return;

    // Compute precision from vertical offset
    const verticalOffset = Math.abs(dy);
    let sensitivity = 1;
    if (verticalOffset > PRECISION_START_PX) {
      const t = Math.min(1, (verticalOffset - PRECISION_START_PX) / (MAX_PRECISION_PX - PRECISION_START_PX));
      sensitivity = 1 - t * (1 - MIN_SENSITIVITY);
    }
    setPrecisionLevel(sensitivity);

    // Apply horizontal movement with precision scaling
    const tw = trackWidth.current || 200;
    const rangePx = tw;
    const range = max - min;
    const valueDelta = (dx / rangePx) * range * sensitivity;
    const newValue = clampAndStep(startValueRef.current + valueDelta);

    if (newValue !== value) {
      onChange(newValue);
    }
  }, [min, max, value, onChange, clampAndStep]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (touchIdRef.current !== e.pointerId) return;

    // If no direction was locked, this was a tap on the track — jump to position
    if (directionRef.current === null && !activeRef.current) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) {
        const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newValue = clampAndStep(min + frac * (max - min));
        onChange(newValue);
      }
    }

    touchIdRef.current = null;
    directionRef.current = null;
    activeRef.current = false;
    setIsDragging(false);
    setPrecisionLevel(1);
  }, [min, max, onChange, clampAndStep]);

  // ─── Tap-to-type ───

  const handleValueTap = useCallback(() => {
    setEditText(String(value));
    setIsEditing(true);
  }, [value]);

  const handleEditSubmit = useCallback(() => {
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      onChange(clampAndStep(parsed));
    }
    setIsEditing(false);
  }, [editText, onChange, clampAndStep]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleEditSubmit();
    if (e.key === 'Escape') setIsEditing(false);
  }, [handleEditSubmit]);

  // ─── Render ───

  const fraction = getFraction();
  const displayValue = formatValue ? formatValue(value) : (
    step < 1 ? value.toFixed(String(step).split('.')[1]?.length || 1) : String(value)
  );

  return (
    <div className={`space-y-1 ${className}`}>
      {/* Label + value row */}
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
          )}
          {showValue && !isEditing && (
            <button
              onClick={handleValueTap}
              className="font-mono text-xs text-text-secondary px-1 py-0.5 rounded hover:bg-bg-raised transition-colors min-h-[28px] flex items-center"
            >
              {displayValue}{unit && <span className="text-text-muted ml-0.5">{unit}</span>}
            </button>
          )}
          {isEditing && (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleEditSubmit}
                onKeyDown={handleEditKeyDown}
                autoFocus
                step={step}
                min={min}
                max={max}
                className="w-16 px-1.5 py-0.5 bg-bg-primary border border-accent rounded text-xs font-mono text-text-primary text-right outline-none"
              />
              {unit && <span className="text-text-muted text-xs">{unit}</span>}
            </div>
          )}
        </div>
      )}

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-8 flex items-center touch-manipulation select-none"
        style={{ touchAction: 'pan-y' }} // Allow vertical scroll passthrough
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full overflow-hidden"
          style={{ top: '50%', transform: 'translateY(-50%)' }}>
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

        {/* Thumb */}
        <div
          className="absolute w-5 h-5 rounded-full bg-white shadow-sm transition-transform"
          style={{
            left: `calc(${fraction * 100}% - 10px)`,
            top: '50%',
            transform: `translateY(-50%) scale(${isDragging ? 1.2 : 1})`,
          }}
        />

        {/* Precision indicator */}
        {isDragging && precisionLevel < 0.8 && (
          <div
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
