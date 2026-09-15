import { useMemo, useState } from 'react';
import type { HitEventsRecord, SessionRecord } from '../../store/db';
import { DEFAULT_ANALYSIS_CONFIG } from '../../analysis/types';
import { rescoreSession } from '../../analysis/reanalysis';
import { persistAnalysisResult } from '../../analysis/persistence';
import { useSettingsStore } from '../../store/settings-store';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord;
  originalHitEvents: HitEventsRecord;
  playheadFraction: number;
  onChange: (next: HitEventsRecord) => void;
}

const MIN_GAP_S = 0.001;

export function HitEditor({ session, hitEvents, originalHitEvents, playheadFraction, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const playheadS = playheadFraction * (session.durationMs / 1000);

  const nearest = useMemo(() => {
    if (hitEvents.rawOnsets.length === 0) return null;
    let index = 0;
    let distance = Infinity;
    hitEvents.rawOnsets.forEach((hit, i) => {
      const value = Math.abs(hit.time - playheadS);
      if (value < distance) { distance = value; index = i; }
    });
    return { index, hit: hitEvents.rawOnsets[index], distance };
  }, [hitEvents.rawOnsets, playheadS]);

  const replaceRaw = (rawOnsets: HitEventsRecord['rawOnsets']) => {
    setSaved(false);
    setError(null);
    onChange({ ...hitEvents, rawOnsets: [...rawOnsets].sort((a, b) => a.time - b.time) });
  };

  const nudgeNearest = (deltaMs: number) => {
    if (!nearest) return;
    const next = hitEvents.rawOnsets.slice();
    const durationS = session.durationMs / 1000;
    next[nearest.index] = { ...next[nearest.index], time: Math.max(0, Math.min(durationS, next[nearest.index].time + deltaMs / 1000)) };
    replaceRaw(next);
  };

  const removeNearest = () => {
    if (nearest) replaceRaw(hitEvents.rawOnsets.filter((_, index) => index !== nearest.index));
  };

  const addAtPlayhead = () => {
    if (hitEvents.rawOnsets.some((hit) => Math.abs(hit.time - playheadS) < MIN_GAP_S)) return;
    replaceRaw([...hitEvents.rawOnsets, { time: playheadS, peak: nearest?.hit.peak ?? 0.5, flux: nearest?.hit.flux ?? 0, isFlam: false }]);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const settings = useSettingsStore.getState();
      const config = {
        ...DEFAULT_ANALYSIS_CONFIG,
        sampleRate: session.recordingSampleRate ?? 48000,
        scoringWindowPct: settings.scoringWindowPct,
        flamMergePct: settings.flamMergePct,
        latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment,
      };
      const meterNumerator = parseInt(session.meter.split('/')[0]) || 4;
      const result = rescoreSession(hitEvents, config, session.bpm, meterNumerator, session.subdivision, session.durationMs);
      const persisted = await persistAnalysisResult(session, result, hitEvents);
      onChange(persisted.hitEvents);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save corrections');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSaved(false);
    setError(null);
    onChange({
      ...originalHitEvents,
      rawOnsets: originalHitEvents.rawOnsets.map((hit) => ({ ...hit })),
      scoredOnsets: originalHitEvents.scoredOnsets.map((hit) => ({ ...hit })),
    });
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-raised/40 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-[10px] font-bold text-text-secondary">Detection Editor</p><p className="text-[9px] text-text-muted">Correct the nearest hit without changing source audio. Saving re-scores and persists the corrected event set atomically.</p></div>
        <span className="text-[9px] font-mono text-text-muted">{hitEvents.rawOnsets.length} hits</span>
      </div>
      <div className="flex items-center justify-between rounded bg-black/10 px-2 py-1.5">
        <span className="text-[9px] text-text-muted">Playhead {(playheadS * 1000).toFixed(0)}ms</span>
        <span className="text-[9px] font-mono text-text-secondary">{nearest ? `Nearest ${(nearest.hit.time * 1000).toFixed(0)}ms · Δ ${(nearest.distance * 1000).toFixed(0)}ms` : 'No detections'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => nudgeNearest(-5)} disabled={!nearest} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/60 disabled:opacity-30">−5ms</button>
        <button onClick={() => nudgeNearest(5)} disabled={!nearest} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/60 disabled:opacity-30">+5ms</button>
        <button onClick={removeNearest} disabled={!nearest} className="min-h-[34px] rounded bg-danger-dim text-[10px] text-danger disabled:opacity-30">Remove</button>
        <button onClick={addAtPlayhead} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/70">Add Here</button>
      </div>
      {error && <p className="text-[10px] text-danger">{error}</p>}
      <div className="flex gap-2">
        <button onClick={reset} className="flex-1 min-h-[34px] rounded border border-border-subtle text-[10px] text-text-muted">Reset</button>
        <button onClick={save} disabled={saving} className="flex-1 min-h-[34px] rounded bg-accent/20 text-[10px] font-bold text-accent disabled:opacity-50">{saving ? 'Saving…' : saved ? 'Saved & rescored' : 'Save Corrections'}</button>
      </div>
    </div>
  );
}
