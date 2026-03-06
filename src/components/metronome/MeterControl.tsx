import { useMetronomeStore } from '../../store/metronome-store';

const NUMERATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Time signature control: numerator/denominator with tap to cycle.
 * Compact inline display for the scrollable area below buttons.
 */
export function MeterControl() {
  const num = useMetronomeStore((s) => s.meterNumerator);
  const den = useMetronomeStore((s) => s.meterDenominator);
  const setMeter = useMetronomeStore((s) => s.setMeter);

  const cycleNum = (dir: number) => {
    const idx = NUMERATORS.indexOf(num);
    const next = NUMERATORS[(idx + dir + NUMERATORS.length) % NUMERATORS.length];
    setMeter(next, den);
  };

  const cycleDen = () => {
    const next = den === 4 ? 8 : 4;
    setMeter(num, next);
  };

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-muted uppercase tracking-wider mr-1">Meter</span>
      <div className="flex items-center bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
        <button
          onClick={() => cycleNum(-1)}
          className="w-[30px] h-[34px] flex items-center justify-center text-text-muted active:bg-bg-raised"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          onClick={cycleDen}
          className="px-1.5 h-[34px] flex items-center justify-center font-mono text-sm font-bold text-text-primary active:bg-bg-raised min-w-[36px]"
        >
          {num}/{den}
        </button>
        <button
          onClick={() => cycleNum(1)}
          className="w-[30px] h-[34px] flex items-center justify-center text-text-muted active:bg-bg-raised"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
