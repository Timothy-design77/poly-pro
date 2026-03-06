import { useState, useRef, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import {
  HOLD_PHASE_1_DURATION,
  HOLD_PHASE_2_DURATION,
  HOLD_PHASE_1_STEP,
  HOLD_PHASE_1_INTERVAL,
  HOLD_PHASE_2_STEP,
  HOLD_PHASE_2_INTERVAL,
  HOLD_PHASE_3_STEP,
  HOLD_PHASE_3_INTERVAL,
} from '../../utils/constants';

/**
 * Two large ± hold-to-accelerate buttons in a row BELOW the dial.
 *
 * Hold behavior:
 * - First 500ms: ±1 BPM every 200ms
 * - After 500ms: ±5 BPM every 100ms
 * - After 2000ms: ±10 BPM every 80ms
 *
 * Speed indicator (×1, ×5, ×10) appears while holding.
 * 0.5 BPM precision always.
 */
export function BpmControl() {
  const adjustBpm = useMetronomeStore((s) => s.adjustBpm);
  const [holdPhase, setHoldPhase] = useState<number>(0);
  const [activeDir, setActiveDir] = useState<'up' | 'down' | null>(null);

  const holdStartRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const phaseCheckRef = useRef<ReturnType<typeof setInterval>>();

  const startHold = useCallback((direction: 'up' | 'down') => {
    const delta = direction === 'up' ? HOLD_PHASE_1_STEP : -HOLD_PHASE_1_STEP;

    // Immediate first step
    adjustBpm(delta);
    setActiveDir(direction);
    setHoldPhase(1);
    holdStartRef.current = Date.now();

    // Start repeating
    let currentPhase = 1;
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - holdStartRef.current;
      let step: number;
      let newPhase: number;

      if (elapsed > HOLD_PHASE_2_DURATION) {
        step = direction === 'up' ? HOLD_PHASE_3_STEP : -HOLD_PHASE_3_STEP;
        newPhase = 3;
      } else if (elapsed > HOLD_PHASE_1_DURATION) {
        step = direction === 'up' ? HOLD_PHASE_2_STEP : -HOLD_PHASE_2_STEP;
        newPhase = 2;
      } else {
        step = delta;
        newPhase = 1;
      }

      adjustBpm(step);

      if (newPhase !== currentPhase) {
        currentPhase = newPhase;
        setHoldPhase(newPhase);

        // Adjust interval for new phase
        clearInterval(intervalRef.current);
        const interval = newPhase === 3
          ? HOLD_PHASE_3_INTERVAL
          : newPhase === 2
            ? HOLD_PHASE_2_INTERVAL
            : HOLD_PHASE_1_INTERVAL;

        intervalRef.current = setInterval(() => {
          const el = Date.now() - holdStartRef.current;
          let s: number;
          let p: number;
          if (el > HOLD_PHASE_2_DURATION) {
            s = direction === 'up' ? HOLD_PHASE_3_STEP : -HOLD_PHASE_3_STEP;
            p = 3;
          } else if (el > HOLD_PHASE_1_DURATION) {
            s = direction === 'up' ? HOLD_PHASE_2_STEP : -HOLD_PHASE_2_STEP;
            p = 2;
          } else {
            s = direction === 'up' ? HOLD_PHASE_1_STEP : -HOLD_PHASE_1_STEP;
            p = 1;
          }
          adjustBpm(s);
          if (p !== currentPhase) {
            currentPhase = p;
            setHoldPhase(p);
          }
        }, interval);
      }
    }, HOLD_PHASE_1_INTERVAL);
  }, [adjustBpm]);

  const stopHold = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (phaseCheckRef.current) clearInterval(phaseCheckRef.current);
    setHoldPhase(0);
    setActiveDir(null);
  }, []);

  const getSpeedLabel = () => {
    if (holdPhase === 3) return '×10';
    if (holdPhase === 2) return '×5';
    if (holdPhase === 1) return '×1';
    return null;
  };

  const speedLabel = getSpeedLabel();

  return (
    <div className="flex gap-2 relative">
      {/* Minus button */}
      <button
        onPointerDown={(e) => { e.preventDefault(); startHold('down'); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={`
          flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
          transition-all h-[50px] touch-manipulation select-none
          ${activeDir === 'down'
            ? 'border-border-emphasis bg-bg-raised shadow-[0_0_12px_rgba(255,255,255,0.06)]'
            : 'border-border-subtle bg-bg-surface active:bg-bg-raised active:border-border-emphasis'
          }
        `}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className="text-text-secondary">
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>

      {/* Speed indicator */}
      {speedLabel && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-6 pointer-events-none">
          <span className="font-mono text-[10px] font-bold text-[rgba(255,255,255,0.4)]">
            {speedLabel}
          </span>
        </div>
      )}

      {/* Plus button */}
      <button
        onPointerDown={(e) => { e.preventDefault(); startHold('up'); }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={`
          flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
          transition-all h-[50px] touch-manipulation select-none
          ${activeDir === 'up'
            ? 'border-border-emphasis bg-bg-raised shadow-[0_0_12px_rgba(255,255,255,0.06)]'
            : 'border-border-subtle bg-bg-surface active:bg-bg-raised active:border-border-emphasis'
          }
        `}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className="text-text-secondary">
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>
    </div>
  );
}
