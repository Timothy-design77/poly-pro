import { useRef, useState, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import {
  BPM_STEP,
  HOLD_PHASE_1_DURATION,
  HOLD_PHASE_2_DURATION,
  HOLD_PHASE_1_STEP,
  HOLD_PHASE_1_INTERVAL,
  HOLD_PHASE_2_STEP,
  HOLD_PHASE_2_INTERVAL,
  HOLD_PHASE_3_STEP,
  HOLD_PHASE_3_INTERVAL,
} from '../../utils/constants';

const HOLD_START_DELAY = 380;
const SCROLL_CANCEL_DISTANCE = 12;

type Direction = 'up' | 'down';

interface PointerGesture {
  pointerId: number;
  startX: number;
  startY: number;
  startBpm: number;
  direction: Direction;
  cancelled: boolean;
  holdStarted: boolean;
  holdStartedAt: number;
}

/**
 * Large, scroll-safe BPM controls below the dial.
 *
 * - Intentional tap: ±0.5 BPM.
 * - Intentional hold: accelerated continuous adjustment.
 * - If the finger moves far enough to become a scroll gesture, all changes
 *   from that press are cancelled and BPM is restored to its starting value.
 */
export function BpmControl() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const adjustBpm = useMetronomeStore((s) => s.adjustBpm);

  const [holdPhase, setHoldPhase] = useState(0);
  const [activeDir, setActiveDir] = useState<Direction | null>(null);

  const gestureRef = useRef<PointerGesture | null>(null);
  const holdDelayRef = useRef<ReturnType<typeof setTimeout>>();
  const tickRef = useRef<ReturnType<typeof setTimeout>>();

  const clearTimers = useCallback(() => {
    if (holdDelayRef.current) clearTimeout(holdDelayRef.current);
    if (tickRef.current) clearTimeout(tickRef.current);
    holdDelayRef.current = undefined;
    tickRef.current = undefined;
  }, []);

  const resetVisuals = useCallback(() => {
    setHoldPhase(0);
    setActiveDir(null);
  }, []);

  const scheduleHoldTick = useCallback((direction: Direction) => {
    const tick = () => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.cancelled || !gesture.holdStarted) return;

      const elapsed = Date.now() - gesture.holdStartedAt;
      let step: number;
      let phase: number;
      let interval: number;

      if (elapsed >= HOLD_PHASE_2_DURATION) {
        step = HOLD_PHASE_3_STEP;
        phase = 3;
        interval = HOLD_PHASE_3_INTERVAL;
      } else if (elapsed >= HOLD_PHASE_1_DURATION) {
        step = HOLD_PHASE_2_STEP;
        phase = 2;
        interval = HOLD_PHASE_2_INTERVAL;
      } else {
        step = HOLD_PHASE_1_STEP;
        phase = 1;
        interval = HOLD_PHASE_1_INTERVAL;
      }

      adjustBpm(direction === 'up' ? step : -step);
      setHoldPhase(phase);
      tickRef.current = setTimeout(tick, interval);
    };

    tick();
  }, [adjustBpm]);

  const startGesture = useCallback((event: React.PointerEvent, direction: Direction) => {
    clearTimers();

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startBpm: bpm,
      direction,
      cancelled: false,
      holdStarted: false,
      holdStartedAt: 0,
    };

    setActiveDir(direction);

    holdDelayRef.current = setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.cancelled || gesture.pointerId !== event.pointerId) return;
      gesture.holdStarted = true;
      gesture.holdStartedAt = Date.now();
      setHoldPhase(1);
      scheduleHoldTick(direction);
    }, HOLD_START_DELAY);
  }, [bpm, clearTimers, scheduleHoldTick]);

  const cancelForScroll = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.cancelled) return;
    gesture.cancelled = true;
    clearTimers();
    if (gesture.holdStarted) setBpm(gesture.startBpm);
    resetVisuals();
  }, [clearTimers, resetVisuals, setBpm]);

  const handlePointerMove = useCallback((event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.cancelled) return;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) >= SCROLL_CANCEL_DISTANCE) {
      cancelForScroll();
    }
  }, [cancelForScroll]);

  const finishGesture = useCallback((event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    clearTimers();

    if (!gesture.cancelled && !gesture.holdStarted) {
      adjustBpm(gesture.direction === 'up' ? BPM_STEP : -BPM_STEP);
    }

    gestureRef.current = null;
    resetVisuals();
  }, [adjustBpm, clearTimers, resetVisuals]);

  const cancelGesture = useCallback((event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    clearTimers();
    if (gesture.holdStarted) setBpm(gesture.startBpm);
    gestureRef.current = null;
    resetVisuals();
  }, [clearTimers, resetVisuals, setBpm]);

  const speedLabel = holdPhase === 3 ? '×10' : holdPhase === 2 ? '×5' : holdPhase === 1 ? '×1' : null;

  const buttonClass = (direction: Direction) => `
    flex-1 flex items-center justify-center rounded-[14px] border-[1.5px]
    transition-colors h-[52px] touch-pan-y select-none
    ${activeDir === direction
      ? 'border-border-emphasis bg-bg-raised'
      : 'border-border-subtle bg-bg-surface active:bg-bg-raised active:border-border-emphasis'
    }
  `;

  return (
    <div className="flex gap-2 relative" aria-label="Tempo adjustment">
      <button
        type="button"
        aria-label="Decrease tempo"
        onPointerDown={(event) => startGesture(event, 'down')}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onPointerLeave={(event) => {
          if (event.buttons !== 0) cancelForScroll();
        }}
        className={buttonClass('down')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className="text-text-primary">
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>

      {speedLabel && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-6 pointer-events-none">
          <span className="font-mono text-[10px] font-bold text-text-muted">
            {speedLabel}
          </span>
        </div>
      )}

      <button
        type="button"
        aria-label="Increase tempo"
        onPointerDown={(event) => startGesture(event, 'up')}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={cancelGesture}
        onPointerLeave={(event) => {
          if (event.buttons !== 0) cancelForScroll();
        }}
        className={buttonClass('up')}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className="text-text-primary">
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="6" y1="12" x2="18" y2="12" />
        </svg>
      </button>
    </div>
  );
}
