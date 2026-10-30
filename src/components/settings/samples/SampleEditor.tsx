import { Button } from '../../ui/Button';
import { Field } from '../../ui/Field';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { WaveformTrimmer } from './WaveformTrimmer';
import { formatBytes } from './sampleAudio';

export type Quality = 48000 | 22050 | 11025;
const QUALITY_OPTIONS: { value: Quality; label: string; ariaLabel: string }[] = [
  { value: 48000, label: 'High', ariaLabel: 'High quality, 48 kHz' },
  { value: 22050, label: 'Normal', ariaLabel: 'Normal quality, 22 kHz' },
  { value: 11025, label: 'Small', ariaLabel: 'Small file, 11 kHz' },
];

interface Props {
  pcm: Float32Array;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  quality: Quality;
  onQualityChange: (quality: Quality) => void;
  name: string;
  onNameChange: (name: string) => void;
  durationMs: number;
  estimatedBytes: number;
  saving: boolean;
  onPreview: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

/** Trim, compress and name a captured or imported sample. */
export function SampleEditor(props: Props) {
  const canSave = props.name.trim().length > 0 && props.durationMs >= 5 && !props.saving;
  return (
    <div className="space-y-4">
      <WaveformTrimmer pcm={props.pcm} trimStart={props.trimStart} trimEnd={props.trimEnd} onTrimChange={props.onTrimChange} />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted tabular-nums">{props.durationMs.toFixed(0)} ms selected · about {formatBytes(props.estimatedBytes)}</span>
        <Button variant="quiet" onClick={props.onPreview} className="-mr-2 px-3">
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21" /></svg>
          Preview
        </Button>
      </div>
      <div className="ui-field">
        <span className="ui-label">Quality</span>
        <SegmentedControl label="Quality" value={props.quality} onChange={props.onQualityChange} options={QUALITY_OPTIONS} />
      </div>
      <Field label="Name">
        <input
          type="text"
          aria-label="Sample name"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value.slice(0, 30))}
          placeholder="For example, Studio snare"
          autoFocus
          className="ui-input"
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={props.onDiscard}>Discard</Button>
        <Button variant="primary" disabled={!canSave} onClick={props.onSave}>
          {props.saving ? 'Saving…' : `Save (${formatBytes(props.estimatedBytes)})`}
        </Button>
      </div>
    </div>
  );
}
