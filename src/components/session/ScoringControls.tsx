import { useState, useEffect, useRef, useCallback } from 'react';
import type { SessionRecord, HitEventsRecord } from '../../store/db';
import type { SessionAnalysis, AnalysisConfig } from '../../analysis/types';
import { DEFAULT_ANALYSIS_CONFIG } from '../../analysis/types';
import { rescoreSession } from '../../analysis/reanalysis';
import { useSettingsStore } from '../../store/settings-store';
import { HelpTip } from '../ui/HelpTip';
import { PrecisionSlider } from '../ui/PrecisionSlider';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord;
  compact?: boolean;
  onResult?: (result: SessionAnalysis) => void;
  onLatencyChange?: (offsetMs: number) => void;
}

export function ScoringControls({ session, hitEvents, compact = false, onResult, onLatencyChange }: Props) {
  const settings = useSettingsStore();
  const defaultLatency = settings.calibratedOffset + settings.manualAdjustment;
  const [config, setConfig] = useState<AnalysisConfig>(() => ({
    ...DEFAULT_ANALYSIS_CONFIG,
    sampleRate: session.recordingSampleRate ?? 48000,
    scoringWindowPct: settings.scoringWindowPct,
    flamMergePct: settings.flamMergePct,
    latencyOffsetMs: defaultLatency,
  }));
  const [liveResult, setLiveResult] = useState<SessionAnalysis | null>(null);
  const [saved, setSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const meterNumerator = parseInt(session.meter.split('/')[0]) || 4;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const result = rescoreSession(hitEvents, config, session.bpm, meterNumerator, session.subdivision, session.durationMs);
      setLiveResult(result);
      onResult?.(result);
    }, 120);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [config, hitEvents, session.bpm, meterNumerator, session.subdivision, session.durationMs, onResult]);

  useEffect(() => { onLatencyChange?.(config.latencyOffsetMs); }, [config.latencyOffsetMs, onLatencyChange]);

  const updateConfig = useCallback((partial: Partial<AnalysisConfig>) => {
    setSaved(false);
    setConfig((current) => ({ ...current, ...partial }));
  }, []);

  const reset = () => {
    setSaved(false);
    setConfig((current) => ({
      ...current,
      scoringWindowPct: settings.scoringWindowPct,
      flamMergePct: settings.flamMergePct,
      latencyOffsetMs: defaultLatency,
    }));
  };

  const saveDefaults = () => {
    settings.setScoringWindowPct(config.scoringWindowPct);
    settings.setFlamMergePct(config.flamMergePct);
    setSaved(true);
  };

  const liveScore = liveResult?.score ?? session.score ?? 0;
  const liveSigma = liveResult?.sigma ?? session.sigma ?? 0;
  const originalScore = session.score ?? 0;
  const scoreDiff = liveScore - originalScore;
  const ioi = 60 / session.bpm / (session.subdivision || 1);
  const scoringMs = ioi * (config.scoringWindowPct / 100) * 1000;
  const flamMs = ioi * (config.flamMergePct / 100) * 1000;

  return (
    <div className="space-y-3">
      <div className="bg-bg-surface rounded-xl border border-border-subtle p-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-text-muted">Live re-score</p>
          <span className="text-2xl font-bold font-mono text-text-primary">{Math.round(liveScore)}%</span>
          {scoreDiff !== 0 && <span className={`text-xs font-mono ml-2 ${scoreDiff > 0 ? 'text-success' : 'text-danger'}`}>{scoreDiff > 0 ? '+' : ''}{Math.round(scoreDiff)}</span>}
        </div>
        <div className="text-right"><p className="text-[10px] text-text-muted">σ</p><span className="text-sm font-mono text-text-secondary">{liveSigma.toFixed(1)}ms</span></div>
      </div>

      <TuneSlider label="Scoring Window" value={config.scoringWindowPct} min={0.25} max={25} step={0.25}
        format={() => `${config.scoringWindowPct}% IOI (±${scoringMs < 10 ? scoringMs.toFixed(1) : scoringMs.toFixed(0)}ms)`}
        defaultValue={settings.scoringWindowPct} onChange={(value) => updateConfig({ scoringWindowPct: value })}
        help="Changes only grid matching, so it can be previewed instantly without re-detecting audio." />

      <TuneSlider label="Flam Merge" value={config.flamMergePct} min={5} max={80} step={1}
        format={() => `${config.flamMergePct}% sub (${flamMs.toFixed(0)}ms)`}
        defaultValue={settings.flamMergePct} onChange={(value) => updateConfig({ flamMergePct: value })}
        help="Re-groups already detected hits before scoring." />

      {!compact && (
        <TuneSlider label="Latency Offset" value={config.latencyOffsetMs} min={-300} max={600} step={0.5}
          format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}ms`}
          defaultValue={defaultLatency} onChange={(value) => updateConfig({ latencyOffsetMs: value })}
          help="Preview the calibrated speaker-to-microphone offset used for grid alignment." />
      )}

      {!compact && (
        <div className="rounded-lg border border-border-subtle bg-bg-raised/40 p-3">
          <p className="text-[10px] font-semibold text-text-secondary">Detection controls are intentionally separate</p>
          <p className="text-[10px] text-text-muted mt-1 leading-relaxed">Noise gate, sensitivity, onset masking, and frequency filtering change which hits are detected. They cannot be represented honestly by an instant re-score of existing hits; configure them in Settings for full analysis/new recordings.</p>
        </div>
      )}

      {!compact && (
        <div className="flex gap-2">
          <button onClick={saveDefaults} className="flex-1 min-h-[40px] rounded-lg bg-white/8 text-xs text-text-secondary">{saved ? 'Defaults saved' : 'Save scoring defaults'}</button>
          <button onClick={reset} className="flex-1 min-h-[40px] rounded-lg border border-border-subtle text-xs text-text-muted">Reset preview</button>
        </div>
      )}
    </div>
  );
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
      <PrecisionSlider min={min} max={max} step={step} value={value} onChange={onChange} formatValue={format} showValue />
    </div>
  );
}
