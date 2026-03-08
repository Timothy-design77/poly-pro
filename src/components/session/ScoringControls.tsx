/**
 * ScoringControls — shared scoring parameter sliders.
 *
 * Used in both Timeline tab (below waveform) and Tune tab (full controls).
 * Adjustments trigger live re-scoring via debounced callback.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, AnalysisConfig } from '../../analysis/types';
import { DEFAULT_ANALYSIS_CONFIG } from '../../analysis/types';
import { rescoreSession } from '../../analysis/reanalysis';
import { useSettingsStore } from '../../store/settings-store';
import { HelpTip } from '../ui/HelpTip';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord;
  /** Show only basic controls (scoring window, flam merge, noise gate) */
  compact?: boolean;
  /** Called when re-scoring produces new results */
  onResult?: (result: SessionAnalysis) => void;
}

export function ScoringControls({ session, hitEvents, compact = false, onResult }: Props) {
  const settings = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [config, setConfig] = useState<AnalysisConfig>(() => ({
    ...DEFAULT_ANALYSIS_CONFIG,
    scoringWindowPct: settings.scoringWindowPct,
    flamMergePct: settings.flamMergePct,
    noiseGate: settings.noiseGate,
    accentThreshold: settings.accentThreshold,
    highPassHz: settings.highPassHz,
    latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
  }));

  const [liveResult, setLiveResult] = useState<SessionAnalysis | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const meterParts = session.meter.split('/');
  const meterNum = parseInt(meterParts[0]) || 4;

  // Live re-scoring on config change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = rescoreSession(
        hitEvents,
        config,
        session.bpm,
        meterNum,
        session.subdivision,
        session.durationMs,
      );
      setLiveResult(result);
      onResult?.(result);
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, hitEvents, session.bpm, meterNum, session.subdivision, session.durationMs, onResult]);

  const updateConfig = useCallback((partial: Partial<AnalysisConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
  }, []);

  const resetBasic = () => {
    updateConfig({
      scoringWindowPct: DEFAULT_ANALYSIS_CONFIG.scoringWindowPct,
      flamMergePct: DEFAULT_ANALYSIS_CONFIG.flamMergePct,
      noiseGate: DEFAULT_ANALYSIS_CONFIG.noiseGate,
    });
  };

  const originalScore = session.score ?? 0;
  const liveScore = liveResult?.score ?? originalScore;
  const liveSigma = liveResult?.sigma ?? session.sigma ?? 0;
  const scoreColor = liveScore >= 85 ? '#4ADE80' : liveScore >= 70 ? '#FBBF24' : '#F87171';
  const scoreDiff = liveScore - originalScore;

  const ioi = 60 / session.bpm / (session.subdivision || 1);
  const scoringMs = ioi * (config.scoringWindowPct / 100) * 1000;
  const flamMs = ioi * (config.flamMergePct / 100) * 1000;

  return (
    <div className="space-y-3">
      {/* Live score preview */}
      <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-text-muted flex items-center gap-1">
            Live Score
            <HelpTip text="Score updates in real-time as you adjust parameters below. Based on consistency (σ) — how tight your timing spread is." />
          </p>
          <span className="text-2xl font-bold font-mono" style={{ color: scoreColor }}>
            {Math.round(liveScore)}%
          </span>
          {scoreDiff !== 0 && (
            <span className={`text-xs font-mono ml-2 ${scoreDiff > 0 ? 'text-success' : 'text-danger'}`}>
              {scoreDiff > 0 ? '+' : ''}{Math.round(scoreDiff)}
            </span>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] text-text-muted flex items-center gap-1 justify-end">
            σ
            <HelpTip text="Standard deviation of your timing deviations in milliseconds. Lower = more consistent. Being consistently early or late doesn't affect σ." />
          </p>
          <span className="text-sm font-mono text-text-secondary">
            {liveSigma.toFixed(1)}ms
          </span>
        </div>
      </div>

      {/* Basic sliders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
            {compact ? 'Scoring' : 'Basic Controls'}
          </span>
          <button onClick={resetBasic} className="text-[10px] text-text-muted underline touch-manipulation">
            Reset
          </button>
        </div>

        <TuneSlider
          label="Scoring Window"
          value={config.scoringWindowPct}
          min={2} max={10} step={0.5}
          format={(v) => `${v}% IOI (±${scoringMs.toFixed(0)}ms)`}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.scoringWindowPct}
          onChange={(v) => updateConfig({ scoringWindowPct: v })}
          help="How close to the beat a hit must land to count as 'scored'. Expressed as a percentage of the time between beats (IOI). Wider = more forgiving."
        />

        <TuneSlider
          label="Flam Merge"
          value={config.flamMergePct}
          min={20} max={60} step={1}
          format={(v) => `${v}% sub (${flamMs.toFixed(0)}ms)`}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.flamMergePct}
          onChange={(v) => updateConfig({ flamMergePct: v })}
          help="When two hits land very close together (a 'flam'), they get merged into one. This sets how close they must be to merge. Higher = more aggressive merging."
        />

        <TuneSlider
          label="Noise Gate"
          value={config.noiseGate}
          min={0.005} max={0.30} step={0.005}
          format={(v) => v.toFixed(3)}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.noiseGate}
          onChange={(v) => updateConfig({ noiseGate: v })}
          help="Minimum energy threshold for a sound to be detected as a hit. Raise this if background noise is triggering false hits. Lower it to catch quieter strokes."
        />
      </div>

      {/* Advanced (only in full mode) */}
      {!compact && (
        <>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-text-muted touch-manipulation flex items-center gap-1"
          >
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Advanced Controls
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l border-border-subtle">
              <TuneSlider
                label="Latency Offset"
                value={config.latencyOffsetMs}
                min={-100} max={300} step={0.5}
                format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}ms`}
                defaultValue={settings.calibratedOffset + settings.manualAdjustment}
                onChange={(v) => updateConfig({ latencyOffsetMs: v })}
                help="Compensates for the delay between playing a sound and it reaching the mic. Set by calibration, but you can fine-tune here."
              />

              <TuneSlider
                label="Accent Threshold"
                value={config.accentThreshold}
                min={1.0} max={3.0} step={0.05}
                format={(v) => `${v.toFixed(2)}×`}
                defaultValue={DEFAULT_ANALYSIS_CONFIG.accentThreshold}
                onChange={(v) => updateConfig({ accentThreshold: v })}
                help="How much louder a hit must be compared to average to be considered an accented stroke. Higher = stricter accent detection."
              />

              <TuneSlider
                label="High-Pass"
                value={config.highPassHz}
                min={0} max={500} step={5}
                format={(v) => v === 0 ? 'Off' : `${v} Hz`}
                defaultValue={0}
                onChange={(v) => updateConfig({ highPassHz: v })}
                help="Filters out low-frequency rumble (air conditioning, traffic, foot taps). Set to 100-200Hz for noisy rooms. Off = no filtering."
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setConfig({ ...DEFAULT_ANALYSIS_CONFIG })}
              className="flex-1 h-[40px] rounded-lg text-xs font-medium
                         border border-border-subtle text-text-muted
                         touch-manipulation active:bg-bg-raised"
            >
              Reset All
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tune Slider with revert icon ───

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
  const isModified = Math.abs(value - defaultValue) > step * 0.5;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-text-secondary flex items-center gap-1">
          {label}
          {help && <HelpTip text={help} />}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono text-text-primary">{format(value)}</span>
          {isModified && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-text-muted touch-manipulation"
              title="Revert to default"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
        </div>
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
