// Bodies of the collapsed Practice settings sections. Loaded on demand (and
// prefetched when the app is idle) so they stay out of the startup bundle.
import { MeterControl } from './MeterControl';
import { SubdivisionPicker } from './SubdivisionPicker';
import { GroupingPicker } from './GroupingPicker';
import { BeatGrid } from './BeatGrid';
import { PracticeModes } from './PracticeModes';
import { TrainerConfig } from './TrainerConfig';
import { PolyrhythmControl } from './PolyrhythmControl';

export function MeterSection() {
  return (
    <div className="space-y-4">
      <MeterControl />
      <SubdivisionPicker />
      <GroupingPicker />
    </div>
  );
}

export { BeatGrid as PatternSection, PracticeModes as ModesSection, TrainerConfig as TrainerSection, PolyrhythmControl as PolyrhythmSection };
