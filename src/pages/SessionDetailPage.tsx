import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionRecord, HitEventsRecord } from '../store/db';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';
import { ScoreTab } from '../components/session/ScoreTab';
import { ClickSyncControls } from '../components/session/ClickSyncControls';
import { ScoringControls } from '../components/session/ScoringControls';
import { TimelineTab } from '../components/session/TimelineTab';
import { ChartsTab } from '../components/session/ChartsTab';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useAnalysis } from '../hooks/useAnalysis';
import { useTakeDraft } from '../hooks/useTakeDraft';

interface Props {
  session: SessionRecord | null;
  visible: boolean;
  onClose: () => void;
  onDelete?: (sessionId: string) => void;
}

export function SessionDetailPage(props: Props) {
  const session = useSessionStore((state) => state.sessions.find((item) => item.id === props.session?.id)) ?? props.session;
  return props.visible && session ? <SessionWorkspace key={session.id} {...props} session={session} /> : null;
}

function SessionWorkspace({ session, onClose, onDelete }: Props & { session: SessionRecord }) {
  const analysis = useAnalysis();
  const [loaded, setLoaded] = useState<{ session: SessionRecord; hitEvents: HitEventsRecord | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'review' | 'charts'>('review');
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [confirmRedetect, setConfirmRedetect] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Metadata-only updates (for example project progression notices) can use
  // the loaded events immediately. New analysis waits for its matching events.
  const draftSession = loaded && (loaded.session.analysisRevision ?? 0) !== (session.analysisRevision ?? 0) ? loaded.session : session;
  const draft = useTakeDraft(draftSession, loaded?.hitEvents ?? null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabsId = useId();
  const requestClose = () => {
    if (draft.saving || deleting || analysis.isAnalyzing) return;
    if (draft.dirty) setConfirmClose(true); else onClose();
  };
  useDialogFocus(dialogRef, true, requestClose);

  useEffect(() => {
    let cancelled = false;
    db.getHitEvents(session.id).then((events) => { if (!cancelled) setLoaded({ session, hitEvents: events ?? null }); })
      .catch(() => { if (!cancelled) setError('Could not load analysis. Close and reopen this take to retry.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.id, session.analysisRevision]);

  const navigateChart = useCallback((chartId: string) => { setOpenChart(chartId); setActiveTab('charts'); }, []);
  const remove = async () => {
    setDeleting(true); setError(null);
    try { await useSessionStore.getState().deleteSession(session.id); onDelete?.(session.id); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not delete this take.'); setConfirmDelete(false); }
    finally { setDeleting(false); }
  };
  const analysisControls = session.hasRecording && <div className="rounded-xl border border-border-subtle bg-bg-surface p-3 space-y-2">
    <p className="text-xs text-text-secondary">{session.analyzed ? 'Re-detect all hits using current detection settings. This replaces saved hit corrections.' : 'Your audio is saved. Analyze it for timing feedback.'}</p>
    {analysis.isAnalyzing ? <>
      <p role="status" className="text-sm">Analyzing… {Math.round((analysis.progress?.progress ?? 0) * 100)}%</p>
      <button className="min-h-[44px] underline" onClick={analysis.abort}>Cancel analysis</button>
    </> : <button disabled={draft.dirty || draft.saving} className="min-h-[44px] px-3 rounded-lg bg-bg-raised text-sm font-semibold disabled:opacity-50" onClick={() => session.analyzed ? setConfirmRedetect(true) : void analysis.analyze(session.id)}>{session.analyzed ? 'Re-detect from audio' : 'Analyze saved recording'}</button>}
    {draft.dirty && <p className="text-xs text-text-muted">Save or discard your preview before re-detecting.</p>}
    {analysis.error && <p role="alert" className="text-sm text-danger">{analysis.error}</p>}
  </div>;
  const take = draft.session;
  const reliable = (take.totalScored ?? take.totalHits) >= 8;
  const busy = draft.saving || deleting || analysis.isAnalyzing;
  return createPortal(<div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Review take" tabIndex={-1} data-no-swipe
    onPointerDownCapture={(event) => { if ((event.target as HTMLElement).closest('[role="slider"]')) draft.beginConfigEdit(); }}
    onPointerUpCapture={draft.endConfigEdit} onPointerCancelCapture={draft.endConfigEdit}
    onKeyDown={(event) => {
      if (busy || confirmClose || confirmDelete || confirmRedetect || event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      // Leave native text editing alone. Review shortcuts also work on sliders.
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      const undo = key === 'z' && !event.shiftKey;
      const redo = (key === 'z' && event.shiftKey) || key === 'y';
      if (!undo && !redo) return;
      event.preventDefault();
      if (undo && draft.canUndo) draft.undo();
      if (redo && draft.canRedo) draft.redo();
    }}
    className="fixed inset-0 z-50 flex flex-col bg-bg-primary outline-none">
    <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border-subtle bg-bg-surface shrink-0">
      <button onClick={requestClose} disabled={busy} className="min-h-[44px] text-sm font-semibold disabled:opacity-50">← Back</button>
      <div className="text-center"><h1 className="text-sm font-semibold text-text-primary">Review take</h1><p className="text-xs text-text-muted">{new Date(session.date).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>
      <button aria-label="Delete session" disabled={busy} onClick={() => setConfirmDelete(true)} className="min-h-[44px] min-w-[44px] text-danger disabled:opacity-50">Delete</button>
    </header>
    <div role="tablist" aria-label="Session detail views" className="review-tabs grid grid-cols-2 gap-4 px-4 py-2 shrink-0">
      {(['review', 'charts'] as const).map((tab) => <button key={tab} id={`${tabsId}-${tab}`} role="tab" aria-selected={activeTab === tab} aria-controls={`${tabsId}-${tab}-panel`} tabIndex={activeTab === tab ? 0 : -1}
        onClick={() => setActiveTab(tab)} onKeyDown={(event) => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 'review' : event.key === 'End' ? 'charts' : activeTab === 'review' ? 'charts' : 'review';
          setActiveTab(next); document.getElementById(`${tabsId}-${next}`)?.focus();
        }} className={`min-h-[44px] border-b-2 text-sm font-semibold ${activeTab === tab ? 'text-text-primary border-accent' : 'text-text-muted border-transparent'}`}>{tab === 'review' ? 'Review' : 'Charts'}</button>)}
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-5">
      {error && <p role="alert" className="text-sm text-danger py-3">{error}</p>}
      <section role="tabpanel" id={`${tabsId}-review-panel`} aria-labelledby={`${tabsId}-review`} hidden={activeTab !== 'review'} className="space-y-3 max-w-4xl mx-auto">
        {take.analyzed && <div className="px-1 py-2">
          <div className="flex justify-between items-center gap-3">
            <div><p className="text-xs text-text-muted">{draft.dirty ? 'Preview score' : 'Score'}</p><p className="text-3xl font-semibold font-mono text-text-primary">{reliable ? `${Math.round(take.score ?? 0)}%` : 'Insufficient hits'}</p></div>
            <div className="text-right text-xs text-text-secondary"><p>{take.totalScored ?? take.totalHits}/{take.totalExpected ?? 0} matched beats</p><p>Timing spread {take.sigma?.toFixed(1) ?? '—'} ms</p></div>
          </div>
          {!reliable && <p role="status" className="text-xs text-text-secondary mt-2">Fewer than 8 matched hits. Check detection below or record a longer take for useful timing feedback.</p>}
          {take.analysisNotice && <p role="status" className="text-xs text-text-secondary mt-2">{take.analysisNotice}</p>}
        </div>}
        {!session.analyzed && analysisControls}
        {!session.hasRecording && draft.hitEvents && session.analyzed && <>
          <ClickSyncControls session={take} hitEvents={draft.hitEvents} offsetMs={draft.config.latencyOffsetMs} onChange={(latencyOffsetMs) => draft.updateConfig({ latencyOffsetMs })} />
          <ScoringControls bpm={take.bpm} subdivision={take.subdivision} config={draft.config} onChange={draft.updateConfig} />
        </>}
        {loading ? <p role="status" className="text-sm py-6">Loading analysis…</p> : <TimelineTab session={take} hitEvents={draft.hitEvents} editableEvents={draft.editableEvents} config={draft.config}
          active={activeTab === 'review' && !analysis.isAnalyzing && !confirmClose && !confirmDelete && !confirmRedetect} saving={draft.saving}
          onConfigChange={draft.updateConfig} onEventsChange={draft.updateEvents} redetectControls={analysisControls} />}
      </section>
      <section role="tabpanel" id={`${tabsId}-charts-panel`} aria-labelledby={`${tabsId}-charts`} hidden={activeTab !== 'charts'} className="max-w-4xl mx-auto space-y-5">
        {activeTab === 'charts' && <><ScoreTab session={take} hitEvents={draft.hitEvents} onNavigateChart={navigateChart} /><ChartsTab session={take} hitEvents={draft.hitEvents} autoOpenSection={openChart} /></>}
      </section>
    </div>
    {(draft.dirty || draft.canUndo || draft.canRedo || draft.message || draft.error) && <div className="shrink-0 border-t border-border-subtle bg-bg-surface px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      {draft.error && <p role="alert" className="text-sm text-danger mb-2">{draft.error}</p>}
      {(draft.canUndo || draft.canRedo || draft.dirty) ? <div className="max-w-4xl mx-auto">
        <p role="status" className="text-xs text-text-muted mb-1">{draft.dirty ? 'Unsaved changes' : 'Back to saved version'}</p>
        <div className="flex items-center gap-2">
          <button aria-label="Undo last change" aria-keyshortcuts="Control+Z Meta+Z" title="Undo last change" disabled={busy || !draft.canUndo} onClick={draft.undo} className="min-h-[44px] min-w-[44px] rounded-lg border border-border-subtle text-xl disabled:opacity-30">↶</button>
          <button aria-label="Redo last change" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" title="Redo last change" disabled={busy || !draft.canRedo} onClick={draft.redo} className="min-h-[44px] min-w-[44px] rounded-lg border border-border-subtle text-xl disabled:opacity-30">↷</button>
          <div className="flex-1" />
          <button disabled={busy} onClick={draft.discard} className="min-h-[44px] px-2 text-sm">Discard</button>
          <button disabled={busy || !draft.dirty} onClick={() => void draft.save()} className="min-h-[44px] px-3 rounded-xl bg-accent text-white text-sm font-semibold disabled:opacity-50">{draft.saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div> : <p role="status" className="text-sm text-success text-center">{draft.message}</p>}
    </div>}
    {confirmClose && <ReviewConfirmation label="Unsaved changes" cancelDisabled={draft.saving} onCancel={() => { if (!draft.saving) setConfirmClose(false); }}>
      <p>Your timing and hit edits haven’t been saved.</p>
      <button disabled={draft.saving} onClick={() => void draft.save().then((saved) => { if (saved) onClose(); })} className="min-h-[44px] w-full rounded-lg bg-accent text-white font-semibold">Save and close</button>
      <button disabled={draft.saving} onClick={onClose} className="min-h-[44px] w-full text-danger">Discard and close</button>
      {draft.error && <p role="alert" className="text-danger text-sm">{draft.error}</p>}
    </ReviewConfirmation>}
    {confirmDelete && <ReviewConfirmation label="Delete session confirmation" cancelDisabled={deleting} onCancel={() => { if (!deleting) setConfirmDelete(false); }}>
      <p>Delete this take and all its recording data?</p><button disabled={deleting} onClick={() => void remove()} className="min-h-[44px] w-full rounded-lg bg-danger text-white">{deleting ? 'Deleting…' : 'Delete'}</button>
    </ReviewConfirmation>}
    {confirmRedetect && <ReviewConfirmation label="Replace saved corrections" onCancel={() => setConfirmRedetect(false)} cancelLabel="Keep saved analysis">
      <p>Replace this take’s saved analysis and corrections?</p><button onClick={() => { setConfirmRedetect(false); void analysis.analyze(session.id, undefined, true); }} className="min-h-[44px] w-full rounded-lg bg-accent text-white">Replace and re-detect</button>
    </ReviewConfirmation>}
  </div>, document.body);
}

function ReviewConfirmation({ label, children, onCancel, cancelLabel = 'Keep reviewing', cancelDisabled = false }: { label: string; children: React.ReactNode; onCancel: () => void; cancelLabel?: string; cancelDisabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, true, onCancel);
  return <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"><div ref={ref} role="alertdialog" aria-modal="true" aria-label={label} tabIndex={-1} className="w-full max-w-md bg-bg-surface p-5 rounded-2xl space-y-3 outline-none text-text-primary"><h2 className="font-semibold">{label}</h2>{children}<button onClick={onCancel} disabled={cancelDisabled} className="min-h-[44px] w-full rounded-lg border border-border-subtle disabled:opacity-50">{cancelLabel}</button></div></div>;
}
