import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionRecord, HitEventsRecord } from '../store/db';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';
import { ScoreTab } from '../components/session/ScoreTab';
import { TimelineTab } from '../components/session/TimelineTab';
import { ChartsTab } from '../components/session/ChartsTab';
import { TuneTab } from '../components/session/TuneTab';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useAnalysis } from '../hooks/useAnalysis';
import { HelpTip } from '../components/ui/HelpTip';

type TabId = 'score' | 'timeline' | 'charts' | 'tune';

interface Props {
  session: SessionRecord | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: (sessionId: string) => void;
}

const TABS: { id: TabId; label: string; help: string }[] = [
  { id: 'score', label: 'Score', help: 'Overall session score, consistency metrics, and insights.' },
  { id: 'timeline', label: 'Playback', help: 'Review the recording, seek precisely, loop sections, compare hits, clean up playback, and export audio.' },
  { id: 'charts', label: 'Charts', help: 'Timing, drift, fatigue, groove, instrument, and dynamics charts.' },
  { id: 'tune', label: 'Tune', help: 'Re-score the stored hit set with scoring-only parameters.' },
];

export function SessionDetailPage({ session: selectedSession, visible, onClose, onDelete }: Props) {
  const session = useSessionStore((state) => state.sessions.find((item) => item.id === selectedSession?.id)) ?? selectedSession;
  const analysis = useAnalysis();
  const [confirmRedetect, setConfirmRedetect] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('score');
  const [hitEvents, setHitEvents] = useState<HitEventsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedSessionRef = useRef<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, visible, onClose);
  const titleId = useId();
  const tabsId = useId();

  const handleNavigateChart = useCallback((chartId: string) => {
    setOpenChart(chartId);
    setActiveTab('charts');
  }, []);

  const handleDelete = useCallback(async () => {
    if (!session) return;
    try {
      await useSessionStore.getState().deleteSession(session.id);
      setShowDeleteConfirm(false);
      onDelete?.(session.id);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not delete this session.');
    }
  }, [session, onDelete, onClose]);

  useEffect(() => {
    if (!session || !visible) { setHitEvents(null); return; }
    let cancelled = false;
    setLoading(loadedSessionRef.current !== session.id);
    setError(null);
    db.getHitEvents(session.id).then((events) => {
      if (!cancelled) { setHitEvents(events ?? null); loadedSessionRef.current = session.id; }
    }).catch((error) => {
      console.error('Failed to load hit events:', error);
      if (!cancelled) { setHitEvents(null); setError('Could not load analysis. Close and reopen this session to retry.'); }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.id, session?.analysisRevision, visible]);

  useEffect(() => {
    if (!visible) return;
    setActiveTab('score');
    setOpenChart(null);
    setShowDeleteConfirm(false);
    setConfirmRedetect(false);

  }, [session?.id, visible]);

  if (!visible || !session) return null;

  const date = new Date(session.date);
  const activeHelp = TABS.find((tab) => tab.id === activeTab)?.help ?? '';
  const content = activeTab === 'score'
    ? <ScoreTab session={session} hitEvents={hitEvents} onNavigateChart={handleNavigateChart} />
    : activeTab === 'timeline'
      ? <TimelineTab session={session} hitEvents={hitEvents} />
      : activeTab === 'charts'
        ? <ChartsTab session={session} hitEvents={hitEvents} autoOpenSection={openChart} />
        : <TuneTab session={session} hitEvents={hitEvents} />;

  const moveTab = (direction: number) => {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const next = TABS[(index + direction + TABS.length) % TABS.length];
    setActiveTab(next.id);
    requestAnimationFrame(() => document.getElementById(`${tabsId}-${next.id}`)?.focus());
  };

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-no-swipe className="fixed inset-0 z-50 flex flex-col bg-bg-primary animate-sheet-up outline-none">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 shrink-0 border-b border-border-subtle bg-bg-surface">
        <button type="button" onClick={onClose} className="min-h-[40px] text-sm font-semibold text-text-primary px-1">← Back</button>
        <span id={titleId} className="text-xs text-text-muted flex items-center gap-1.5 text-center">
          {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          <HelpTip text={activeHelp} />
        </span>
        {onDelete ? (
          <button type="button" onClick={() => setShowDeleteConfirm(true)} className="w-[40px] h-[40px] flex items-center justify-center text-text-secondary rounded-lg active:bg-danger-dim active:text-danger" aria-label="Delete session">🗑</button>
        ) : <div className="w-[40px]" />}
      </div>

      {showDeleteConfirm && (
        <div role="alertdialog" aria-label="Delete session confirmation" className="mx-4 mt-3 bg-danger-dim border border-danger/30 rounded-lg p-3 shrink-0">
          <p className="text-danger text-xs font-medium mb-2">Delete this session and all its data?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowDeleteConfirm(false)} className="flex-1 min-h-[42px] border border-border-subtle bg-bg-surface text-text-secondary rounded-lg text-xs font-semibold">Cancel</button>
            <button type="button" onClick={() => void handleDelete()} className="flex-1 min-h-[42px] bg-danger text-white rounded-lg text-xs font-semibold">Delete</button>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Session detail views" className="grid grid-cols-4 gap-1 px-4 py-2 shrink-0 bg-bg-primary">
        {TABS.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`${tabsId}-${tab.id}`}
            aria-selected={activeTab === tab.id}
            aria-controls={`${tabsId}-panel`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') { event.preventDefault(); moveTab(1); }
              else if (event.key === 'ArrowLeft') { event.preventDefault(); moveTab(-1); }
              else if (event.key === 'Home') { event.preventDefault(); setActiveTab(TABS[0].id); }
              else if (event.key === 'End') { event.preventDefault(); setActiveTab(TABS[TABS.length - 1].id); }
            }}
            className={`min-h-[42px] rounded-lg text-[11px] font-bold tracking-wide border ${activeTab === tab.id ? 'bg-accent text-bg-primary border-accent' : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'}`}
          >{tab.label}</button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${activeTab}`} className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 overscroll-contain">
        {session.hasRecording && (!session.analyzed || activeTab === 'tune') && <div className="my-3 rounded-xl border border-border-subtle bg-bg-surface p-3 space-y-2">
          <p className="text-sm text-text-secondary">{session.analyzed ? 'Re-detect hits from the saved audio using current detection settings. This replaces saved hit corrections.' : 'Analyze this saved take, including recovered recordings.'}</p>
          {analysis.isAnalyzing ? <>
            <p role="status" className="text-sm text-text-secondary">Analyzing… {Math.round((analysis.progress?.progress ?? 0) * 100)}%</p>
            <button className="min-h-[44px] underline" onClick={analysis.abort}>Cancel analysis</button>
          </> : confirmRedetect ? <div role="alertdialog" aria-label="Replace saved corrections" className="space-y-2">
            <p className="text-sm text-danger">Replace this take’s saved analysis and corrections?</p>
            <button className="min-h-[44px] px-3 bg-accent text-white rounded-lg" onClick={() => { setConfirmRedetect(false); void analysis.analyze(session.id, undefined, true); }}>Replace and re-detect</button>
            <button className="min-h-[44px] px-3" onClick={() => setConfirmRedetect(false)}>Keep saved analysis</button>
          </div> : <button className="min-h-[44px] px-3 bg-accent text-white rounded-lg" onClick={() => session.analyzed ? setConfirmRedetect(true) : void analysis.analyze(session.id)}>{session.analyzed ? 'Re-detect from audio' : 'Analyze saved recording'}</button>}
          {analysis.error && <p role="alert" className="text-sm text-danger">{analysis.error}</p>}
        </div>}
        {error && <p role="alert" className="my-3 rounded-lg bg-danger-dim p-3 text-sm text-danger">{error}</p>}
        {loading ? <div className="flex items-center justify-center h-32"><span className="text-text-muted text-sm" role="status">Loading analysis…</span></div> : analysis.isAnalyzing ? null : content}
      </div>
    </div>,
    document.body,
  );
}
