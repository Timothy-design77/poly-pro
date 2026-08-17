import { useMetronomeStore } from '../../store/metronome-store';

const NUMERATORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17];
const DENOMINATORS = [2, 4, 8, 16];

const focusClass = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export function MeterControl() {
  const numerator = useMetronomeStore((state) => state.meterNumerator);
  const denominator = useMetronomeStore((state) => state.meterDenominator);
  const setMeter = useMetronomeStore((state) => state.setMeter);

  const cycleNumerator = (direction: number) => {
    const index = NUMERATORS.indexOf(numerator);
    const next = index >= 0
      ? NUMERATORS[(index + direction + NUMERATORS.length) % NUMERATORS.length]
      : NUMERATORS[0];
    setMeter(next, denominator);
  };

  const cycleDenominator = () => {
    const index = DENOMINATORS.indexOf(denominator);
    const next = DENOMINATORS[(index + 1) % DENOMINATORS.length];
    setMeter(numerator, next);
  };

  return (
    <div>
      <div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
        Time Signature
      </div>
      <div className="flex items-center justify-center gap-3" role="group" aria-label="Time signature">
        <button
          type="button"
          onClick={() => cycleNumerator(-1)}
          aria-label={`Previous numerator. Current time signature ${numerator}/${denominator}.`}
          className={`w-[48px] h-[48px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center text-text-secondary active:bg-bg-raised
                     touch-manipulation ${focusClass}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          onClick={cycleDenominator}
          aria-label={`Time signature ${numerator}/${denominator}. Activate to change denominator.`}
          className={`w-[80px] h-[56px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center font-mono text-2xl font-bold text-text-primary
                     active:bg-bg-raised touch-manipulation ${focusClass}`}
        >
          {numerator}/{denominator}
        </button>

        <button
          type="button"
          onClick={() => cycleNumerator(1)}
          aria-label={`Next numerator. Current time signature ${numerator}/${denominator}.`}
          className={`w-[48px] h-[48px] rounded-xl bg-bg-surface border border-border-subtle
                     flex items-center justify-center text-text-secondary active:bg-bg-raised
                     touch-manipulation ${focusClass}`}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function useMeterBadge(): string {
  const numerator = useMetronomeStore((state) => state.meterNumerator);
  const denominator = useMetronomeStore((state) => state.meterDenominator);
  const subdivision = useMetronomeStore((state) => state.subdivision);
  const subdivisionLabels: Record<number, string> = {
    1: '',
    2: '8ths',
    3: 'Triplets',
    4: '16ths',
    5: 'Quints',
    6: 'Sextuplets',
  };
  const subdivisionText = subdivisionLabels[subdivision] || '';
  return `${numerator}/${denominator}${subdivisionText ? ` · ${subdivisionText}` : ''}`;
}
