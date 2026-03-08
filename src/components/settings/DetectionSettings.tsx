/**
 * DetectionSettings — noise controls section for the Settings overlay.
 *
 * Per the plan: scoring window, flam merge, noise gate, accent threshold,
 * detection preset picker. Selecting a preset fills the sliders;
 * modifying a slider switches to "Custom".
 */

import { useSettingsStore } from '../../store/settings-store';
import { DETECTION_PRESETS } from '../../analysis/types';

export function DetectionSettings() {
  const scoringWindowPct = useSettingsStore((s) => s.scoringWindowPct);
  const flamMergePct = useSettingsStore((s) => s.flamMergePct);
  const noiseGate = useSettingsStore((s) => s.noiseGate);
  const accentThreshold = useSettingsStore((s) => s.accentThreshold);
  const highPassHz = useSettingsStore((s) => s.highPassHz);
  const detectionPreset = useSettingsStore((s) => s.detectionPreset);

  const setScoringWindowPct = useSettingsStore((s) => s.setScoringWindowPct);
  const setFlamMergePct = useSettingsStore((s) => s.setFlamMergePct);
  const setNoiseGate = useSettingsStore((s) => s.setNoiseGate);
  const setAccentThreshold = useSettingsStore((s) => s.setAccentThreshold);
  const setHighPassHz = useSettingsStore((s) => s.setHighPassHz);
  const setDetectionPreset = useSettingsStore((s) => s.setDetectionPreset);

  return (
    <div className="space-y-4">
      {/* Preset picker */}
      <div>
        <label className="text-[10px] text-text-muted font-medium uppercase tracking-wider block mb-1.5">
          Detection Preset
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DETECTION_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => setDetectionPreset(p.name)}
              className={`
                px-3 py-1.5 rounded-lg text-xs font-medium touch-manipulation
                ${detectionPreset === p.name
                  ? 'bg-[rgba(255,255,255,0.12)] text-text-primary border border-border-emphasis'
                  : 'bg-bg-raised text-text-secondary border border-border-subtle'}
              `}
            >
              {p.name}
            </button>
          ))}
          {detectionPreset === 'Custom' && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-raised text-text-muted border border-border-subtle">
              Custom
            </span>
          )}
        </div>
        {detectionPreset !== 'Custom' && (
          <p className="text-[10px] text-text-muted mt-1">
            {DETECTION_PRESETS.find((p) => p.name === detectionPreset)?.description}
          </p>
        )}
      </div>

      {/* Scoring Window */}
      <SliderRow
        label="Scoring Window"
        value={scoringWindowPct}
        min={2}
        max={10}
        step={0.5}
        format={(v) => `${v}% IOI`}
        onChange={setScoringWindowPct}
      />

      {/* Flam Merge */}
      <SliderRow
        label="Flam Merge"
        value={flamMergePct}
        min={20}
        max={60}
        step={1}
        format={(v) => `${v}% sub`}
        onChange={setFlamMergePct}
      />

      {/* Noise Gate */}
      <SliderRow
        label="Noise Gate"
        value={noiseGate}
        min={0.01}
        max={0.30}
        step={0.005}
        format={(v) => v.toFixed(3)}
        onChange={setNoiseGate}
      />

      {/* Accent Threshold */}
      <SliderRow
        label="Accent Threshold"
        value={accentThreshold}
        min={1.0}
        max={3.0}
        step={0.05}
        format={(v) => `${v.toFixed(2)}×`}
        onChange={setAccentThreshold}
      />

      {/* High-Pass Cutoff */}
      <SliderRow
        label="High-Pass"
        value={highPassHz}
        min={0}
        max={500}
        step={5}
        format={(v) => v === 0 ? 'Off' : `${v} Hz`}
        onChange={setHighPassHz}
      />
    </div>
  );
}

// ─── Reusable slider row ───

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
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary">{label}</span>
        <span className="text-xs font-mono text-text-primary">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer touch-manipulation"
        style={{
          background: `linear-gradient(to right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.4) ${
            ((value - min) / (max - min)) * 100
          }%, rgba(255,255,255,0.08) ${
            ((value - min) / (max - min)) * 100
          }%, rgba(255,255,255,0.08) 100%)`,
        }}
      />
    </div>
  );
}
