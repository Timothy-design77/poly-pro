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
      <div className="text-xs text-text-muted  mb-2">
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
              type="button" aria-pressed={isActive}
              onClick={() => setGrouping(grouping)}
              className="ui-chip tabular-nums"
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
