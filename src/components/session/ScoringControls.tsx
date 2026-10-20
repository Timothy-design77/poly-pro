import { useState } from 'react';
import type { AnalysisConfig } from '../../analysis/types';
import { useSettingsStore } from '../../store/settings-store';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';

interface Props {
  bpm: number;
  subdivision: number;
  config: AnalysisConfig;
  onChange: (partial: Partial<AnalysisConfig>) => void;
}

export function ScoringControls({ bpm, subdivision, config, onChange }: Props) {
  const settings = useSettingsStore();
  const [saved, setSaved] = useState(false);
  const ioiMs = 60000 / bpm / (subdivision || 1);
  const saveDefaults = () => {
    settings.setScoringWindowPct(config.scoringWindowPct);
    settings.setFlamMergePct(config.flamMergePct);
    setSaved(true);
  };
  const update = (partial: Partial<AnalysisConfig>) => { setSaved(false); onChange(partial); };
  return <div className="space-y-4">
    <TuneSlider label="Scoring Window" value={config.scoringWindowPct} min={0.25} max={25} step={0.25}
      format={() => `±${(ioiMs * config.scoringWindowPct / 100).toFixed(1)}ms (${config.scoringWindowPct}%)`}
      defaultValue={settings.scoringWindowPct} onChange={(value) => update({ scoringWindowPct: value })}
      help="How close a hit needs to be to the beat to count as perfect. The percentage uses the take’s starting tempo and subdivision, so the displayed millisecond window stays fixed for the whole take." />
    <TuneSlider label="Flam Merge" value={config.flamMergePct} min={5} max={80} step={1}
      format={() => `${(ioiMs * config.flamMergePct / 100).toFixed(0)}ms (${config.flamMergePct}%)`}
      defaultValue={settings.flamMergePct} onChange={(value) => update({ flamMergePct: value })}
      help="Treat nearby hits as one flam. This uses a fixed millisecond window based on the take’s starting tempo and subdivision. Lower this to separate close hits. Your saved source hits are preserved." />
    <button onClick={saveDefaults} className="w-full min-h-[44px] rounded-lg border border-border-subtle text-sm text-text-secondary">{saved ? 'Defaults saved' : 'Use scoring for future takes'}</button>

  </div>;
}

interface TuneSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  defaultValue: number;
  onChange: (value: number) => void;
  help?: string;
}

function TuneSlider({ label, value, min, max, step, format, defaultValue, onChange, help }: TuneSliderProps) {
  const modified = Math.abs(value - defaultValue) > step * 0.5;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary flex items-center gap-1">{label}{help && <HelpTip text={help} />}</span>
        {modified && <button type="button" onClick={() => onChange(defaultValue)} className="text-xs text-text-muted underline">Revert</button>}
      </div>
      <PrecisionSlider ariaLabel={label} min={min} max={max} step={step} value={value} onChange={onChange} formatValue={format} showValue />
    </div>
  );
}
