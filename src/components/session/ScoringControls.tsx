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
  const defaultLatency = settings.calibratedOffset + settings.manualAdjustment;
  const ioiMs = 60000 / bpm / (subdivision || 1);
  const saveDefaults = () => {
    settings.setScoringWindowPct(config.scoringWindowPct);
    settings.setFlamMergePct(config.flamMergePct);
    setSaved(true);
  };
  const update = (partial: Partial<AnalysisConfig>) => { setSaved(false); onChange(partial); };
  return <div className="space-y-4">
    <p className="text-sm text-text-secondary">Preview timing changes while listening. Save changes to keep the score and click alignment together.</p>
    <TuneSlider label="Latency Offset" value={config.latencyOffsetMs} min={Math.min(-300, config.latencyOffsetMs)} max={Math.max(600, config.latencyOffsetMs)} step={0.5}
      format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}ms`} defaultValue={defaultLatency}
      onChange={(value) => update({ latencyOffsetMs: value })}
      help="Moves the timing grid and playback clicks together against the recording. Positive values place the clicks later. Source audio stays unchanged." />
    <TuneSlider label="Scoring Window" value={config.scoringWindowPct} min={0.25} max={25} step={0.25}
      format={() => `±${(ioiMs * config.scoringWindowPct / 100).toFixed(1)}ms (${config.scoringWindowPct}%)`}
      defaultValue={settings.scoringWindowPct} onChange={(value) => update({ scoringWindowPct: value })}
      help="How close a hit needs to be to the beat to count as perfect." />
    <TuneSlider label="Flam Merge" value={config.flamMergePct} min={5} max={80} step={1}
      format={() => `${(ioiMs * config.flamMergePct / 100).toFixed(0)}ms (${config.flamMergePct}%)`}
      defaultValue={settings.flamMergePct} onChange={(value) => update({ flamMergePct: value })}
      help="Treat nearby hits as one flam. Lower this to separate close hits. Your saved source hits are preserved." />
    <button onClick={saveDefaults} className="w-full min-h-[44px] rounded-lg border border-border-subtle text-sm text-text-secondary">{saved ? 'Defaults saved' : 'Use scoring for future takes'}</button>
    <p className="text-xs text-text-muted">Latency changes apply to this take. Set device calibration in Settings. For missed or extra hits, try Edit hits first. Detection settings and Re-detect from audio can rebuild the whole hit set.</p>
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
        {modified && <button type="button" onClick={() => onChange(defaultValue)} className="text-[10px] text-text-muted underline">Revert</button>}
      </div>
      <PrecisionSlider ariaLabel={label} min={min} max={max} step={step} value={value} onChange={onChange} formatValue={format} showValue />
    </div>
  );
}
