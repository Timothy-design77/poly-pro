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
      <div className="ui-label mb-2">Subdivision</div>
      <div role="group" aria-label="Subdivision" className="flex flex-wrap gap-1.5">
        {SUBDIVISIONS.map((s) => (
          <button
            key={s.value}
            type="button" aria-pressed={subdivision === s.value}
            onClick={() => setSubdivision(s.value)}
            className="ui-chip"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
