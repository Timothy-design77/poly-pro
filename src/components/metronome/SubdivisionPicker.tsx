import { useMetronomeStore } from '../../store/metronome-store';

const SUBDIVISIONS: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'None', short: '–' },
  { value: 2, label: '8ths', short: '♪' },
  { value: 3, label: 'Triplets', short: '3' },
  { value: 4, label: '16ths', short: '♬' },
  { value: 6, label: 'Sextuplets', short: '6' },
];

/**
 * Subdivision picker — horizontal pill selector.
 */
export function SubdivisionPicker() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const setSubdivision = useMetronomeStore((s) => s.setSubdivision);

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-muted uppercase tracking-wider mr-1">Sub</span>
      <div className="flex gap-0.5 bg-bg-surface border border-border-subtle rounded-lg p-0.5">
        {SUBDIVISIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSubdivision(s.value)}
            className={`
              px-2 h-[28px] rounded-md text-[11px] font-bold transition-all
              touch-manipulation select-none min-w-[32px]
              ${subdivision === s.value
                ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                : 'text-text-muted active:bg-bg-raised'
              }
            `}
          >
            {s.short}
          </button>
        ))}
      </div>
    </div>
  );
}
