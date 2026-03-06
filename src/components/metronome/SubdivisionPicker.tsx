import { useMetronomeStore } from '../../store/metronome-store';

const SUBDIVISIONS: { value: number; label: string }[] = [
  { value: 1, label: 'None' },
  { value: 2, label: '8ths' },
  { value: 3, label: 'Triplets' },
  { value: 4, label: '16ths' },
  { value: 5, label: 'Quints' },
  { value: 6, label: 'Sextuplets' },
];

/**
 * Subdivision picker — large pill buttons.
 * Designed to live inside a CollapsibleCard alongside MeterControl.
 */
export function SubdivisionPicker() {
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const setSubdivision = useMetronomeStore((s) => s.setSubdivision);

  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">Subdivision</div>
      <div className="flex gap-1.5 flex-wrap">
        {SUBDIVISIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSubdivision(s.value)}
            className={`
              h-[40px] px-3.5 rounded-xl text-xs font-bold transition-colors
              touch-manipulation select-none min-w-[52px]
              ${subdivision === s.value
                ? 'bg-[rgba(255,255,255,0.15)] text-text-primary border border-[rgba(255,255,255,0.15)]'
                : 'bg-bg-surface border border-border-subtle text-text-muted active:bg-bg-raised'
              }
            `}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
