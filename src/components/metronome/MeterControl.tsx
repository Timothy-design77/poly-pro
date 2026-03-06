import { useMetronomeStore } from '../../store/metronome-store';

const NUMERATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17];
const DENOMINATORS = [2, 4, 8, 16];

/**
 * Time signature control — large buttons, tap arrows to cycle numerator,
 * tap the signature itself to cycle denominator.
 */
export function MeterControl() {
  const num = useMetronomeStore((s) => s.meterNumerator);
  const den = useMetronomeStore((s) => s.meterDenominator);
  const setMeter = useMetronomeStore((s) => s.setMeter);

  const cycleNum = (dir: number) => {
    const idx = NUMERATORS.indexOf(num);
    const next = idx >= 0
      ? NUMERATORS[(idx + dir + NUMERATORS.length) % NUMERATORS.length]
      : NUMERATORS[0];
    setMeter(next, den);
  };

  const cycleDen = () => {
    const idx = DENOMINATORS.indexOf(den);
    const next = DENOMINATORS[(idx + 1) % DENOMINATORS.length];
    setMeter(num, next);
  };

  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Time Signature</div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => cycleNum(-1)}
          className="w-[48px] h-[48px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center text-text-secondary active:bg-bg-raised
                     touch-manipulation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          onClick={cycleDen}
          className="w-[80px] h-[56px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center font-mono text-2xl font-bold text-text-primary
                     active:bg-bg-raised touch-manipulation"
        >
          {num}/{den}
        </button>

        <button
          onClick={() => cycleNum(1)}
          className="w-[48px] h-[48px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center text-text-secondary active:bg-bg-raised
                     touch-manipulation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Badge text for the collapsed header */
export function useMeterBadge(): string {
  const num = useMetronomeStore((s) => s.meterNumerator);
  const den = useMetronomeStore((s) => s.meterDenominator);
  const sub = useMetronomeStore((s) => s.subdivision);
  const subLabels: Record<number, string> = { 1: '', 2: '8ths', 3: 'Triplets', 4: '16ths', 5: 'Quints', 6: 'Sextuplets' };
  const subText = subLabels[sub] || '';
  return `${num}/${den}${subText ? ' · ' + subText : ''}`;
}
