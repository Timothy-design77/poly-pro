import { useState } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { DETECTION_PRESETS } from '../../analysis/types';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';
import { DetectionTestBench } from './DetectionTestBench';

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
    <div className="space-y-4">
      <div>
        <label className="text-[10px] text-text-muted font-medium uppercase tracking-wider flex items-center gap-1 mb-1.5">
          Detection Preset
          <HelpTip text="Presets configure the detection controls at once. Adjusting a control individually switches to Custom." />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DETECTION_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.name}
              onClick={() => setDetectionPreset(preset.name)}
              className={`px-3 min-h-[38px] rounded-lg text-xs font-medium touch-manipulation border
                ${detectionPreset === preset.name
                  ? 'bg-accent text-bg-primary border-accent'
                  : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'}`}
            >
              {preset.name}
            </button>
          ))}
          {detectionPreset === 'Custom' && (
            <span className="px-3 min-h-[38px] flex items-center rounded-lg text-xs font-medium bg-accent-dim text-text-primary border border-border-emphasis">
              Custom
            </span>
          )}
        </div>
        {detectionPreset !== 'Custom' && (
          <p className="text-[10px] text-text-muted mt-1.5">
            {DETECTION_PRESETS.find((preset) => preset.name === detectionPreset)?.description}
          </p>
        )}
      </div>

      <SliderRow label="Scoring Window" value={scoringWindowPct} min={0.25} max={25} step={0.25}
        format={(value) => `${value}% IOI`} onChange={setScoringWindowPct} />
      <SliderRow label="Flam Merge" value={flamMergePct} min={5} max={80} step={1}
        format={(value) => `${value}% sub`} onChange={setFlamMergePct} />
      <SliderRow label="Noise Gate" value={noiseGate} min={0.001} max={0.5} step={0.001}
        format={(value) => value.toFixed(3)} onChange={setNoiseGate} />
      <SliderRow label="Accent Threshold" value={accentThreshold} min={1} max={6} step={0.05}
        format={(value) => `${value.toFixed(2)}×`} onChange={setAccentThreshold} />
      <SliderRow label="High-Pass" value={highPassHz} min={0} max={2000} step={5}
        format={(value) => value === 0 ? 'Off' : `${value} Hz`} onChange={setHighPassHz} />

      <div className="border-t border-border-subtle pt-3 mt-1 space-y-3">
        <p className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Onset Detection</p>
        <SliderRow label="Noise Floor ×" value={noiseFloorMult} min={1} max={50} step={1}
          format={(value) => `${value}×`} onChange={setNoiseFloorMult} />
        <SliderRow label="Min Onset Gap" value={minOnsetInterval} min={5} max={300} step={1}
          format={(value) => `${value}ms`} onChange={setMinOnsetInterval} />
        <SliderRow label="Post-Hit Mask" value={postHitMasking} min={0} max={400} step={5}
          format={(value) => value === 0 ? 'Off' : `${value}ms`} onChange={setPostHitMasking} />
        <SliderRow label="Mask Strength" value={maskingStrength} min={0} max={60} step={1}
          format={(value) => `${value}×`} onChange={setMaskingStrength} />
        <SliderRow label="Flux Threshold" value={fluxThreshold} min={0.1} max={6} step={0.1}
          format={(value) => value.toFixed(1)} onChange={setFluxThreshold} />
      </div>

      <button
        type="button"
        onClick={() => setShowTestBench(true)}
        className="w-full min-h-[44px] bg-bg-surface border border-border-emphasis text-text-primary
                   rounded-lg text-sm font-semibold active:bg-bg-raised flex items-center justify-center gap-2"
      >
        Run Detection Test
      </button>

      <DetectionTestBench visible={showTestBench} onClose={() => setShowTestBench(false)} />
    </div>
  );
}
