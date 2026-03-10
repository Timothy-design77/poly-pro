/**
 * ScoringControls — shared scoring parameter sliders.
 *
 * Used in both Timeline tab and Tune tab.
 * Basic tier: scoring window, flam merge, noise gate
 * Advanced tier: 3 collapsible sub-groups per plan:
 *   1. Latency & Offset: latency offset, manual bias correction
 *   2. Detection Sensitivity: input gain, accent threshold
 *   3. Frequency Filtering: high-pass cutoff, band-pass center
 *
 * Save as Default / Reset All (with confirmation)
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
  /** Show only basic controls */
  compact?: boolean;
  /** Called when re-scoring produces new results */
  onResult?: (result: SessionAnalysis) => void;
  /** Called when latency offset changes (for click overlay sync) */
  onLatencyChange?: (offsetMs: number) => void;
}

export function ScoringControls({ session, hitEvents, compact = false, onResult, onLatencyChange }: Props) {
  const settings = useSettingsStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedGroup, setAdvancedGroup] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = rescoreSession(
        hitEvents, config, session.bpm, meterNum, session.subdivision, session.durationMs,
      );
      setLiveResult(result);
      onResult?.(result);
    }, 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [config, hitEvents, session.bpm, meterNum, session.subdivision, session.durationMs, onResult]);

  const updateConfig = useCallback((partial: Partial<AnalysisConfig>) => {
    setConfig((c) => ({ ...c, ...partial }));
  }, []);

  // Notify parent when latency offset changes (for click overlay sync)
  useEffect(() => {
    onLatencyChange?.(config.latencyOffsetMs);
  }, [config.latencyOffsetMs, onLatencyChange]);

  const resetBasic = () => {
    updateConfig({
      scoringWindowPct: DEFAULT_ANALYSIS_CONFIG.scoringWindowPct,
      flamMergePct: DEFAULT_ANALYSIS_CONFIG.flamMergePct,
      noiseGate: DEFAULT_ANALYSIS_CONFIG.noiseGate,
    });
  };

  const resetGroup = (group: string) => {
    if (group === 'latency') {
      updateConfig({
        latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
        biasCorrection: 0,
      });
    } else if (group === 'sensitivity') {
      updateConfig({
        inputGain: DEFAULT_ANALYSIS_CONFIG.inputGain,
        accentThreshold: DEFAULT_ANALYSIS_CONFIG.accentThreshold,
      });
    } else if (group === 'filtering') {
      updateConfig({
        highPassHz: DEFAULT_ANALYSIS_CONFIG.highPassHz,
        bandPassHz: DEFAULT_ANALYSIS_CONFIG.bandPassHz,
      });
    }
  };

  const resetAll = () => {
    setConfig({
      ...DEFAULT_ANALYSIS_CONFIG,
      latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
    });
    setConfirmReset(false);
  };

  const saveAsDefault = () => {
    settings.setScoringWindowPct(config.scoringWindowPct);
    settings.setFlamMergePct(config.flamMergePct);
    settings.setNoiseGate(config.noiseGate);
    settings.setAccentThreshold(config.accentThreshold);
    settings.setHighPassHz(config.highPassHz);
  };

  const originalScore = session.score ?? 0;
  const liveScore = liveResult?.score ?? originalScore;
  const liveSigma = liveResult?.sigma ?? session.sigma ?? 0;
  const scoreColor = liveScore >= 85 ? '#4ADE80' : liveScore >= 70 ? '#FBBF24' : '#F87171';
  const scoreDiff = liveScore - originalScore;

  const ioi = 60 / session.bpm / (session.subdivision || 1);
  const scoringMs = ioi * (config.scoringWindowPct / 100) * 1000;
  const flamMs = ioi * (config.flamMergePct / 100) * 1000;

  const toggleGroup = (g: string) => setAdvancedGroup(advancedGroup === g ? null : g);

  return (
    <div className="space-y-3">
      {/* Live score preview */}
      <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-text-muted flex items-center gap-1">
            Live Score
            <HelpTip text="Score updates in real-time as you adjust parameters below." />
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
            σ <HelpTip text="Standard deviation of timing deviations. Lower = more consistent." />
          </p>
          <span className="text-sm font-mono text-text-secondary">{liveSigma.toFixed(1)}ms</span>
        </div>
      </div>

      {/* ─── Basic tier ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">Basic Controls</span>
          <button onClick={resetBasic} className="text-[10px] text-text-muted underline touch-manipulation">Reset</button>
        </div>

        <TuneSlider label="Scoring Window" value={config.scoringWindowPct}
          min={2} max={10} step={0.5}
          format={(v) => `${v}% IOI (±${scoringMs.toFixed(0)}ms)`}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.scoringWindowPct}
          onChange={(v) => updateConfig({ scoringWindowPct: v })}
          help="How close to the beat a hit must land to count as scored." />

        <TuneSlider label="Flam Merge" value={config.flamMergePct}
          min={20} max={60} step={1}
          format={(v) => `${v}% sub (${flamMs.toFixed(0)}ms)`}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.flamMergePct}
          onChange={(v) => updateConfig({ flamMergePct: v })}
          help="Two hits closer than this get merged into one." />

        <TuneSlider label="Noise Gate" value={config.noiseGate}
          min={0.005} max={0.30} step={0.005}
          format={(v) => v.toFixed(3)}
          defaultValue={DEFAULT_ANALYSIS_CONFIG.noiseGate}
          onChange={(v) => updateConfig({ noiseGate: v })}
          help="Minimum energy to count as a hit. Raise for noisy rooms." />
      </div>

      {/* ─── Advanced tier (3 sub-groups) ─── */}
      {!compact && (
        <>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-text-muted touch-manipulation flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Advanced Controls
          </button>

          {showAdvanced && (
            <div className="space-y-2">
              {/* Group 1: Latency & Offset */}
              <AdvancedGroup
                title="Latency & Offset" isOpen={advancedGroup === 'latency'}
                onToggle={() => toggleGroup('latency')}
                onReset={() => resetGroup('latency')}
              >
                <TuneSlider label="Latency Offset" value={config.latencyOffsetMs}
                  min={-100} max={300} step={0.5}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}ms`}
                  defaultValue={settings.calibratedOffset + settings.manualAdjustment}
                  onChange={(v) => updateConfig({ latencyOffsetMs: v })}
                  help="Compensates for speaker→mic round-trip delay. Set by calibration." />
                <TuneSlider label="Bias Correction" value={config.biasCorrection}
                  min={-50} max={50} step={0.5}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}ms`}
                  defaultValue={0}
                  onChange={(v) => updateConfig({ biasCorrection: v })}
                  help="Fine-tune if your mean offset is consistently off. Shifts all onsets." />
              </AdvancedGroup>

              {/* Group 2: Detection Sensitivity */}
              <AdvancedGroup
                title="Detection Sensitivity" isOpen={advancedGroup === 'sensitivity'}
                onToggle={() => toggleGroup('sensitivity')}
                onReset={() => resetGroup('sensitivity')}
              >
                <TuneSlider label="Input Gain" value={config.inputGain}
                  min={0.5} max={3.0} step={0.1}
                  format={(v) => `${v.toFixed(1)}×`}
                  defaultValue={1.0}
                  onChange={(v) => updateConfig({ inputGain: v })}
                  help="Multiplies input signal before detection. Raise for quiet instruments." />
                <TuneSlider label="Accent Threshold" value={config.accentThreshold}
                  min={1.0} max={3.0} step={0.05}
                  format={(v) => `${v.toFixed(2)}×`}
                  defaultValue={DEFAULT_ANALYSIS_CONFIG.accentThreshold}
                  onChange={(v) => updateConfig({ accentThreshold: v })}
                  help="How much louder a hit must be to count as an accent." />
              </AdvancedGroup>

              {/* Group 3: Frequency Filtering */}
              <AdvancedGroup
                title="Frequency Filtering" isOpen={advancedGroup === 'filtering'}
                onToggle={() => toggleGroup('filtering')}
                onReset={() => resetGroup('filtering')}
              >
                <TuneSlider label="High-Pass Cutoff" value={config.highPassHz}
                  min={0} max={500} step={5}
                  format={(v) => v === 0 ? 'Off' : `${v} Hz`}
                  defaultValue={0}
                  onChange={(v) => updateConfig({ highPassHz: v })}
                  help="Filters out low-frequency rumble. 100-200Hz for noisy rooms." />
                <TuneSlider label="Band-Pass Center" value={config.bandPassHz}
                  min={0} max={8000} step={50}
                  format={(v) => v === 0 ? 'Off' : `${v} Hz`}
                  defaultValue={0}
                  onChange={(v) => updateConfig({ bandPassHz: v })}
                  help="Focus detection on a frequency range. Useful for isolating specific drums." />
              </AdvancedGroup>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={saveAsDefault}
              className="flex-1 h-[40px] rounded-lg text-xs font-medium
                         bg-[rgba(255,255,255,0.08)] text-text-secondary
                         touch-manipulation active:bg-[rgba(255,255,255,0.12)]">
              Save as Default
            </button>
            <button
              onClick={() => confirmReset ? resetAll() : setConfirmReset(true)}
              className={`flex-1 h-[40px] rounded-lg text-xs font-medium touch-manipulation
                ${confirmReset
                  ? 'bg-danger-dim text-danger border border-danger'
                  : 'border border-border-subtle text-text-muted active:bg-bg-raised'}`}>
              {confirmReset ? 'Confirm Reset' : 'Reset All'}
            </button>
          </div>
          {confirmReset && (
            <button onClick={() => setConfirmReset(false)}
              className="text-[10px] text-text-muted underline touch-manipulation w-full text-center">
              Cancel
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Advanced Group (collapsible sub-group with per-group revert) ───

function AdvancedGroup({
  title, isOpen, onToggle, onReset, children,
}: {
  title: string; isOpen: boolean; onToggle: () => void;
  onReset: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={onToggle} className="flex-1 text-left text-xs font-medium text-text-secondary touch-manipulation flex items-center gap-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {title}
        </button>
        {isOpen && (
          <button onClick={onReset} className="text-[9px] text-text-muted underline touch-manipulation">Reset</button>
        )}
      </div>
      {isOpen && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

// ─── Tune Slider with revert icon ───

import { PrecisionSlider } from '../ui/PrecisionSlider';

interface TuneSliderProps {
  label: string; value: number; min: number; max: number; step: number;
  format: (value: number) => string; defaultValue: number;
  onChange: (value: number) => void; help?: string;
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
          {isModified && (
            <button onClick={() => onChange(defaultValue)} className="text-text-muted touch-manipulation" title="Revert">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <PrecisionSlider
        min={min} max={max} step={step} value={value}
        onChange={onChange}
        formatValue={format}
        showValue
      />
    </div>
  );
}
