import type { InstrumentName, InstrumentProfile } from '../../analysis/classification';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { ProgressRing } from '../ui/Progress';

export const ALL_INSTRUMENTS: InstrumentName[] = ['Kick', 'Snare', 'Hi-Hat', 'Tom Hi', 'Tom Lo', 'Ride', 'Crash', 'Other'];

function validationText(profile: InstrumentProfile, profileCount: number) {
  return profileCount < 2 || profile.accuracy < 0 ? 'Train another instrument to validate' : `${Math.round(profile.accuracy * 100)}% validated`;
}

export function InstrumentGrid({ profiles, selected, onSelect, onDelete, onStart }: {
  profiles: InstrumentProfile[];
  selected: InstrumentName | null;
  onSelect: (name: InstrumentName, quick: boolean) => void;
  onDelete: (name: InstrumentName) => void;
  onStart: () => void;
}) {
  const selectedProfile = profiles.find((profile) => profile.name === selected);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-text-secondary">
        Pick an instrument, then play at least 20 steady hits on it. Poly Pro learns how your kit sounds so it can label instruments in recordings.
      </p>
      <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
        {ALL_INSTRUMENTS.map((name) => {
          const profile = profiles.find((p) => p.name === name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={selected === name}
              onClick={() => onSelect(name, !!profile)}
              className="ui-choice flex min-h-[72px] flex-col items-start justify-center gap-0.5 px-3 text-left"
            >
              <span className="text-sm font-semibold text-text-primary">{name}</span>
              <span className="text-xs font-normal text-text-muted">{profile ? `${profile.samples.length} hits` : 'Not trained'}</span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="space-y-2">
          {selectedProfile && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-text-secondary">{selectedProfile.samples.length} hits · {validationText(selectedProfile, profiles.length)}</p>
              <Button variant="danger-quiet" className="shrink-0 px-3" aria-label={`Delete ${selected} profile`} onClick={() => onDelete(selected)}>Delete</Button>
            </div>
          )}
          <Button variant="primary" size="lg" block onClick={onStart}>{selectedProfile ? `Retrain ${selected}` : `Train ${selected}`}</Button>
          {selectedProfile && <p className="ui-hint text-center">Retraining adds at least 5 more hits to the existing profile.</p>}
        </div>
      )}
    </div>
  );
}

export function TrainingRecording({ instrument, hitCount, minHits, quick, onFinish, onCancel }: {
  instrument: InstrumentName;
  hitCount: number;
  minHits: number;
  quick: boolean;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const ready = hitCount >= minHits;
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 py-4 text-center">
      <div>
        <h2 className="text-xl font-semibold text-text-primary">{instrument}</h2>
        <p className="mt-1 text-sm text-text-secondary">{quick ? 'Retraining. ' : ''}Play steady, evenly spaced hits.</p>
      </div>
      <ProgressRing value={hitCount} max={minHits} done={ready} label={`${instrument} hits detected`}>
        <span className="text-3xl font-semibold tabular-nums text-text-primary">{hitCount}</span>
        <span className="block text-xs text-text-muted">of {minHits} hits</span>
      </ProgressRing>
      <p role="status" className="flex items-center gap-2 text-sm text-text-secondary">
        <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-recording" />
        {ready ? 'Enough hits. Save when you are ready.' : 'Listening. Stops after 60 seconds; the count is approximate.'}
      </p>
      <div className="grid w-full max-w-[360px] grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="lg" onClick={onFinish} disabled={hitCount < 3}>
          {ready ? 'Save training' : hitCount >= 3 ? 'Finish early' : `Need ${3 - hitCount} more`}
        </Button>
      </div>
    </div>
  );
}

export function TrainingDone({ instrument, accuracy, hitCount, onTrainAnother, onClose }: {
  instrument: InstrumentName;
  accuracy: number | null;
  hitCount: number;
  onTrainAnother: () => void;
  onClose: () => void;
}) {
  const validated = accuracy !== null && accuracy >= 0;
  const pct = validated ? Math.round(accuracy * 100) : 0;
  const tone = pct >= 80 ? 'text-success' : pct >= 60 ? 'text-warning' : 'text-danger';
  return (
    <div className="flex min-h-full flex-col justify-center gap-6 py-4 text-center" aria-live="polite">
      <h2 className="text-xl font-semibold text-text-primary">{instrument} trained</h2>
      <div className="ui-surface p-5">
        <p className="text-xs text-text-muted">Training validation</p>
        <p className={`mt-1 text-3xl font-semibold tabular-nums ${validated ? tone : 'text-text-primary text-lg'}`}>{validated ? `${pct}%` : 'Needs a second instrument'}</p>
        <p className="mt-2 text-xs text-text-muted">{hitCount} training hits saved</p>
      </div>
      {validated && pct < 60 && <Notice tone="warning" className="text-left">Low validation. Train with steadier hits, or check that each instrument sounds distinct.</Notice>}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="lg" onClick={onTrainAnother}>Train another</Button>
        <Button variant="primary" size="lg" onClick={onClose}>Done</Button>
      </div>
    </div>
  );
}
