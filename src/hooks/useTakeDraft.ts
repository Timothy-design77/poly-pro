import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HitEventsRecord, SessionRecord } from '../store/db';
import { DEFAULT_ANALYSIS_CONFIG, type AnalysisConfig } from '../analysis/types';
import { analysisToHitEvents, applyAnalysisToSession, persistAnalysisResult } from '../analysis/persistence';
import { rescoreSession } from '../analysis/reanalysis';
import { useSettingsStore } from '../store/settings-store';

function savedConfig(session: SessionRecord): AnalysisConfig {
  const settings = useSettingsStore.getState();
  return { ...DEFAULT_ANALYSIS_CONFIG, sampleRate: session.recordingSampleRate ?? 48000,
    scoringWindowPct: settings.scoringWindowPct, flamMergePct: settings.flamMergePct,
    latencyOffsetMs: settings.calibratedOffset + settings.manualAdjustment, ...session.analysisConfig };
}

/** One draft drives the score, markers, click track and atomic save. */
export function useTakeDraft(session: SessionRecord, hitEvents: HitEventsRecord | null) {
  const [base, setBase] = useState({ session, hitEvents });
  const [config, setConfig] = useState(() => savedConfig(session));
  const [edits, setEdits] = useState<HitEventsRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A re-detection or newly loaded take refreshes the base. Never erase an
    // unsaved draft because a background read finishes after an edit.
    if (!dirty && !savingRef.current && hitEvents && (base.session.id !== session.id || !base.hitEvents || (session.analysisRevision ?? 0) > (base.session.analysisRevision ?? 0))) {
      setBase({ session, hitEvents }); setConfig(savedConfig(session)); setEdits(null);
    }
  }, [session, hitEvents, base, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const events = edits ?? base.hitEvents;
  const result = useMemo(() => {
    if (!dirty || !events || !base.session.analyzed) return null;
    const take = base.session;
    const rescored = rescoreSession(events, config, take.bpm, parseInt(take.meter) || 4, take.subdivision, take.durationMs);
    const notes = (take.headlines ?? []).map((note) => ({ text: typeof note === 'string' ? note : note.text })).filter((note) => note.text.startsWith('Estimated beat grid:'));
    return { ...rescored, headlines: [...notes, ...rescored.headlines], noiseFloor: take.noiseFloor ?? 0, autoLatencyMs: take.autoLatencyMs ?? 0 };
  }, [dirty, events, config, base.session]);
  const previewSession = useMemo(() => result ? { ...applyAnalysisToSession(base.session, result), analysisConfig: config } : base.session, [base.session, result, config]);
  const previewEvents = useMemo(() => result ? analysisToHitEvents(session.id, result, events) : events, [session.id, result, events]);

  const updateConfig = useCallback((partial: Partial<AnalysisConfig>) => {
    if (savingRef.current) return;
    setConfig((current) => ({ ...current, ...partial })); setDirty(true); setMessage(''); setError(null);
  }, []);
  const updateEvents = useCallback((next: HitEventsRecord) => {
    if (savingRef.current) return;
    setEdits(next); setDirty(true); setMessage(''); setError(null);
  }, []);
  const discard = useCallback(() => {
    if (savingRef.current) return;
    setBase({ session, hitEvents }); setConfig(savedConfig(session)); setEdits(null); setDirty(false); setMessage(''); setError(null);
  }, [session, hitEvents]);
  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!result || !events || savingRef.current) return false;
    savingRef.current = true; setSaving(true); setError(null);
    try {
      const saved = await persistAnalysisResult(base.session, result, events, config);
      setBase({ session: saved.session, hitEvents: saved.hitEvents }); setEdits(null);
      setDirty(false); setMessage('Changes saved'); return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this take.'); return false;
    } finally { savingRef.current = false; setSaving(false); }
  }, [dirty, result, events, base.session, config]);
  return { session: previewSession, hitEvents: previewEvents, editableEvents: events, config,
    dirty, saving, message, error, updateConfig, updateEvents, discard, save };
}
