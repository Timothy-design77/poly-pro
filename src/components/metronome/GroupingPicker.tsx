import { useMetronomeStore } from '../../store/metronome-store';
import { getAvailableGroupings } from '../../utils/timing';

/**
 * Beat grouping picker for irregular meters.
 * Shows available grouping options (e.g. 7/8: [2,2,3] [2,3,2] [3,2,2]).
 * Only renders when there are multiple options.
 */
export function GroupingPicker() {
  const num = useMetronomeStore((s) => s.meterNumerator);
  const den = useMetronomeStore((s) => s.meterDenominator);
  const currentGrouping = useMetronomeStore((s) => s.beatGrouping);
  const setGrouping = useMetronomeStore((s) => s.setGrouping);

  const options = getAvailableGroupings(num, den);

  // Don't show if there's only one option (simple meters like 4/4)
  if (options.length <= 1) return null;

  const currentKey = JSON.stringify(currentGrouping);

  // Limit to a reasonable number of options (most useful first)
  const displayOptions = options.slice(0, 12);

  return (
    <div>
      <div className="text-[10px] text-text-muted uppercase tracking-wider mb-2">
        Beat Grouping
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {displayOptions.map((grouping) => {
          const key = JSON.stringify(grouping);
          const isActive = key === currentKey;
          const label = grouping.join('+');

          return (
            <button
              key={key}
              onClick={() => setGrouping(grouping)}
              className={`
                h-[40px] px-3 rounded-xl text-xs font-bold font-mono
                transition-colors touch-manipulation select-none
                ${isActive
                  ? 'bg-[rgba(255,255,255,0.15)] text-text-primary border border-[rgba(255,255,255,0.15)]'
                  : 'bg-bg-surface border border-border-subtle text-text-muted active:bg-bg-raised'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
