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

interface DraftSnapshot {
  config: AnalysisConfig;
  events: HitEventsRecord | null;
}
interface DraftHistory {
  past: DraftSnapshot[];
  present: DraftSnapshot;
  future: DraftSnapshot[];
  configGroup?: number | null;
}
const HISTORY_LIMIT = 50;
const emptyHistory = (present: DraftSnapshot): DraftHistory => ({ past: [], present, future: [] });
const sameConfig = (a: AnalysisConfig, b: AnalysisConfig) =>
  (Object.keys(a) as (keyof AnalysisConfig)[]).every((key) => a[key] === b[key]);

/** One draft drives the score, markers, click track and atomic save. */
export function useTakeDraft(session: SessionRecord, hitEvents: HitEventsRecord | null) {
  const [base, setBase] = useState(() => ({ session, hitEvents, config: savedConfig(session) }));
  const [history, setHistory] = useState(() => emptyHistory({ config: base.config, events: hitEvents }));
  const { config, events } = history.present;
  const dirty = events !== base.hitEvents || !sameConfig(config, base.config);
  const configGroup = useRef<number | null>(null);
  const nextGroup = useRef(0);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // A re-detection or newly loaded take refreshes the base. Never erase an
    // unsaved draft because a background read finishes after an edit.
    if (!dirty && !savingRef.current && hitEvents && (base.session.id !== session.id || !base.hitEvents || (session.analysisRevision ?? 0) > (base.session.analysisRevision ?? 0))) {
      const config = savedConfig(session);
      setBase({ session, hitEvents, config });
      setHistory(emptyHistory({ config, events: hitEvents }));
      setMessage(''); setError(null);
    } else if (!savingRef.current && session !== base.session && session.id === base.session.id && (session.analysisRevision ?? 0) === (base.session.analysisRevision ?? 0)) {
      // A project association or progression notice may change without a new
      // analysis. Keep the draft and its history while refreshing metadata.
      setBase((current) => ({ ...current, session }));
    }
  }, [session, hitEvents, base, dirty]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
    const group = configGroup.current;
    setHistory((current) => {
      const config = { ...current.present.config, ...partial };
      if (sameConfig(config, current.present.config)) return current;
      return {
        past: group !== null && current.configGroup === group ? current.past : [...current.past, current.present].slice(-HISTORY_LIMIT),
        present: { ...current.present, config }, future: [], configGroup: group,
      };
    });
    setMessage(''); setError(null);
  }, []);
  const updateEvents = useCallback((next: HitEventsRecord) => {
    if (savingRef.current) return;
    setHistory((current) => next === current.present.events ? current : {
      past: [...current.past, current.present].slice(-HISTORY_LIMIT),
      present: { ...current.present, events: next }, future: [],
    });
    setMessage(''); setError(null);
  }, []);
  const beginConfigEdit = useCallback(() => { configGroup.current = ++nextGroup.current; }, []);
  const endConfigEdit = useCallback(() => { configGroup.current = null; }, []);
  const undo = useCallback(() => {
    if (savingRef.current) return;
    configGroup.current = null;
    setHistory((current) => current.past.length ? {
      past: current.past.slice(0, -1), present: current.past[current.past.length - 1],
      future: [current.present, ...current.future],
    } : current);
    setMessage(''); setError(null);
  }, []);
  const redo = useCallback(() => {
    if (savingRef.current) return;
    configGroup.current = null;
    setHistory((current) => current.future.length ? {
      past: [...current.past, current.present].slice(-HISTORY_LIMIT), present: current.future[0],
      future: current.future.slice(1),
    } : current);
    setMessage(''); setError(null);
  }, []);
  const discard = useCallback(() => {
    if (savingRef.current) return;
    // The incoming pair can still be loading after our own successful save.
    // Always discard to the confirmed saved base, never that older pair.
    configGroup.current = null;
    setHistory(emptyHistory({ config: base.config, events: base.hitEvents }));
    setMessage(''); setError(null);
  }, [base]);
  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty) return true;
    if (!result || !events || savingRef.current) return false;
    savingRef.current = true; setSaving(true); setError(null);
    try {
      const saved = await persistAnalysisResult(base.session, result, events, config);
      setBase({ session: saved.session, hitEvents: saved.hitEvents, config });
      setHistory(emptyHistory({ config, events: saved.hitEvents }));
      configGroup.current = null;
      setMessage('Changes saved'); return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save this take.'); return false;
    } finally { savingRef.current = false; setSaving(false); }
  }, [dirty, result, events, base.session, config]);
  return { session: previewSession, hitEvents: previewEvents, editableEvents: events, config,
    dirty, saving, message, error, updateConfig, updateEvents, discard, save,
    canUndo: history.past.length > 0, canRedo: history.future.length > 0, undo, redo, beginConfigEdit, endConfigEdit };
}
