import { useState, useRef, useCallback, useEffect } from 'react';
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

type Direction = 'up' | 'down';

function phaseForElapsed(elapsed: number): 1 | 2 | 3 {
  if (elapsed > HOLD_PHASE_2_DURATION) return 3;
  if (elapsed > HOLD_PHASE_1_DURATION) return 2;
  return 1;
}

function stepForPhase(direction: Direction, phase: 1 | 2 | 3): number {
  const magnitude = phase === 3
    ? HOLD_PHASE_3_STEP
    : phase === 2
      ? HOLD_PHASE_2_STEP
      : HOLD_PHASE_1_STEP;
  return direction === 'up' ? magnitude : -magnitude;
}

function intervalForPhase(phase: 1 | 2 | 3): number {
  if (phase === 3) return HOLD_PHASE_3_INTERVAL;
  if (phase === 2) return HOLD_PHASE_2_INTERVAL;
  return HOLD_PHASE_1_INTERVAL;
}

export function BpmControl() {
  const adjustBpm = useMetronomeStore((state) => state.adjustBpm);
  const [holdPhase, setHoldPhase] = useState<0 | 1 | 2 | 3>(0);
  const [activeDirection, setActiveDirection] = useState<Direction | null>(null);
  const holdStartRef = useRef(0);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRepeat = useCallback(() => {
    if (repeatTimerRef.current) {
      clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
    setHoldPhase(0);
    setActiveDirection(null);
  }, []);

  useEffect(() => clearRepeat, [clearRepeat]);

  const scheduleRepeat = useCallback((direction: Direction) => {
    const repeat = () => {
      const phase = phaseForElapsed(Date.now() - holdStartRef.current);
      setHoldPhase(phase);
      adjustBpm(stepForPhase(direction, phase));
      repeatTimerRef.current = setTimeout(repeat, intervalForPhase(phase));
    };
    repeatTimerRef.current = setTimeout(repeat, HOLD_PHASE_1_INTERVAL);
  }, [adjustBpm]);

  const startHold = useCallback((direction: Direction, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    clearRepeat();
    holdStartRef.current = Date.now();
    setActiveDirection(direction);
    setHoldPhase(1);
    adjustBpm(stepForPhase(direction, 1));
    scheduleRepeat(direction);
  }, [adjustBpm, clearRepeat, scheduleRepeat]);

  const handleKeyboardClick = useCallback((direction: Direction, event: React.MouseEvent<HTMLButtonElement>) => {
    // Pointer interaction already performs the first step on pointerdown.
    // detail === 0 identifies keyboard-generated click activation.
    if (event.detail === 0) adjustBpm(stepForPhase(direction, 1));
  }, [adjustBpm]);

  const speedLabel = holdPhase === 3
    ? '×10'
    : holdPhase === 2
      ? '×5'
      : holdPhase === 1
        ? '×1'
        : null;

  const buttonClass = (direction: Direction) => `
    flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
    transition-all h-[50px] touch-manipulation select-none
    focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white
    ${activeDirection === direction
      ? 'border-border-emphasis bg-bg-raised shadow-[0_0_12px_rgba(255,255,255,0.06)]'
      : 'border-border-subtle bg-bg-surface active:bg-bg-raised active:border-border-emphasis'
    }
  `;

  return (
    <div className="flex gap-2 relative" aria-label="Tempo adjustment controls">
      <button
        type="button"
        aria-label="Decrease tempo. Hold to accelerate."
        onPointerDown={(event) => startHold('down', event)}
        onPointerUp={clearRepeat}
        onPointerLeave={clearRepeat}
        onPointerCancel={clearRepeat}
        onClick={(event) => handleKeyboardClick('down', event)}
        className={buttonClass('down')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-text-secondary"
          aria-hidden="true"
        >
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>

      {speedLabel && (
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-6 pointer-events-none"
          aria-live="polite"
        >
          <span className="font-mono text-[10px] font-bold text-text-secondary">
            {speedLabel}
          </span>
        </div>
      )}

      <button
        type="button"
        aria-label="Increase tempo. Hold to accelerate."
        onPointerDown={(event) => startHold('up', event)}
        onPointerUp={clearRepeat}
        onPointerLeave={clearRepeat}
        onPointerCancel={clearRepeat}
        onClick={(event) => handleKeyboardClick('up', event)}
        className={buttonClass('up')}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-text-secondary"
          aria-hidden="true"
        >
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>
    </div>
  );
}
