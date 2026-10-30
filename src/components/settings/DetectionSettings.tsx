import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { DETECTION_PRESETS } from '../../analysis/types';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';
import { DetectionTestBench } from './DetectionTestBench';
import { Button } from '../ui/Button';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, min, max, step, format, onChange }: SliderRowProps) {
  return (
    <PrecisionSlider
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      formatValue={format}
      label={label}
      showValue
    />
  );
}

export function DetectionSettings() {
  const [showTestBench, setShowTestBench] = useState(false);
  const scoringWindowPct = useSettingsStore((s) => s.scoringWindowPct);
  const flamMergePct = useSettingsStore((s) => s.flamMergePct);
  const noiseGate = useSettingsStore((s) => s.noiseGate);
  const accentThreshold = useSettingsStore((s) => s.accentThreshold);
  const highPassHz = useSettingsStore((s) => s.highPassHz);
  const detectionPreset = useSettingsStore((s) => s.detectionPreset);
  const noiseFloorMult = useSettingsStore((s) => s.noiseFloorMultiplier);
  const minOnsetInterval = useSettingsStore((s) => s.minOnsetIntervalMs);
  const postHitMasking = useSettingsStore((s) => s.postHitMaskingMs);
  const maskingStrength = useSettingsStore((s) => s.postHitMaskingStrength);
  const fluxThreshold = useSettingsStore((s) => s.fluxThresholdOffset);

  const setScoringWindowPct = useSettingsStore((s) => s.setScoringWindowPct);
  const setFlamMergePct = useSettingsStore((s) => s.setFlamMergePct);
  const setNoiseGate = useSettingsStore((s) => s.setNoiseGate);
  const setAccentThreshold = useSettingsStore((s) => s.setAccentThreshold);
  const setHighPassHz = useSettingsStore((s) => s.setHighPassHz);
  const setDetectionPreset = useSettingsStore((s) => s.setDetectionPreset);
  const setNoiseFloorMult = useSettingsStore((s) => s.setNoiseFloorMultiplier);
  const setMinOnsetInterval = useSettingsStore((s) => s.setMinOnsetIntervalMs);
  const setPostHitMasking = useSettingsStore((s) => s.setPostHitMaskingMs);
  const setMaskingStrength = useSettingsStore((s) => s.setPostHitMaskingStrength);
  const setFluxThreshold = useSettingsStore((s) => s.setFluxThresholdOffset);

  return (
    <div className="space-y-5">
      <div className="ui-field">
        <span className="ui-label flex items-center gap-2">
          Preset
          <HelpTip text="Presets set all detection controls at once. Changing a control yourself switches to Custom." />
        </span>
        <div role="group" aria-label="Detection preset" className="ui-segmented">
          {DETECTION_PRESETS.map((preset) => (
            <button type="button" key={preset.name} aria-pressed={detectionPreset === preset.name} onClick={() => setDetectionPreset(preset.name)}>
              {preset.name}
            </button>
          ))}
          {detectionPreset === 'Custom' && <button type="button" aria-pressed disabled className="opacity-100!">Custom</button>}
        </div>
        <span className="ui-hint">
          {detectionPreset === 'Custom' ? 'Your own settings.' : DETECTION_PRESETS.find((preset) => preset.name === detectionPreset)?.description}
        </span>
      </div>

      <SliderRow label="Scoring window" value={scoringWindowPct} min={0.25} max={25} step={0.25}
        format={(value) => `${value}% IOI`} onChange={setScoringWindowPct} />
      <SliderRow label="Flam merge" value={flamMergePct} min={5} max={80} step={1}
        format={(value) => `${value}% sub`} onChange={setFlamMergePct} />
      <SliderRow label="Noise gate" value={noiseGate} min={0.001} max={0.5} step={0.001}
        format={(value) => value.toFixed(3)} onChange={setNoiseGate} />
      <SliderRow label="Accent threshold" value={accentThreshold} min={1} max={6} step={0.05}
        format={(value) => `${value.toFixed(2)}×`} onChange={setAccentThreshold} />
      <SliderRow label="High-pass filter" value={highPassHz} min={0} max={2000} step={5}
        format={(value) => value === 0 ? 'Off' : `${value} Hz`} onChange={setHighPassHz} />

      <div className="border-t border-border-subtle pt-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Hit detection</h3>
        <SliderRow label="Noise floor" value={noiseFloorMult} min={1} max={50} step={1}
          format={(value) => `${value}×`} onChange={setNoiseFloorMult} />
        <SliderRow label="Minimum gap between hits" value={minOnsetInterval} min={5} max={300} step={1}
          format={(value) => `${value}ms`} onChange={setMinOnsetInterval} />
        <SliderRow label="Post-hit mask" value={postHitMasking} min={0} max={400} step={5}
          format={(value) => value === 0 ? 'Off' : `${value}ms`} onChange={setPostHitMasking} />
        <SliderRow label="Mask strength" value={maskingStrength} min={0} max={60} step={1}
          format={(value) => `${value}×`} onChange={setMaskingStrength} />
        <SliderRow label="Flux threshold" value={fluxThreshold} min={0.1} max={6} step={0.1}
          format={(value) => value.toFixed(1)} onChange={setFluxThreshold} />
      </div>

      <Button variant="secondary" block onClick={() => setShowTestBench(true)}>Run detection test</Button>

      <DetectionTestBench visible={showTestBench} onClose={() => setShowTestBench(false)} />
    </div>
  );
}
