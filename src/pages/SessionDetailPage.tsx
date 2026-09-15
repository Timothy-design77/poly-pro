import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SessionRecord, HitEventsRecord } from '../store/db';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';
import { ScoreTab } from '../components/session/ScoreTab';
import { TimelineTab } from '../components/session/TimelineTab';
import { ChartsTab } from '../components/session/ChartsTab';
import { TuneTab } from '../components/session/TuneTab';
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
  { id: 'timeline', label: 'Timeline', help: 'Recording timeline with waveform/spectrogram, timing markers, playback, loops, and correction tools.' },
  { id: 'charts', label: 'Charts', help: 'Timing, drift, fatigue, groove, instrument, and dynamics charts.' },
  { id: 'tune', label: 'Tune', help: 'Re-score the stored hit set with scoring-only parameters.' },
];

export function SessionDetailPage({ session, visible, onClose, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('score');
  const [hitEvents, setHitEvents] = useState<HitEventsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
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
      console.error('Delete failed:', error);
    }
  }, [session, onDelete, onClose]);

  useEffect(() => {
    if (!session || !visible) { setHitEvents(null); return; }
    let cancelled = false;
    setLoading(true);
    db.getHitEvents(session.id).then((events) => {
      if (!cancelled) setHitEvents(events ?? null);
    }).catch((error) => {
      console.error('Failed to load hit events:', error);
      if (!cancelled) setHitEvents(null);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session?.id, visible]);

  useEffect(() => {
    if (!visible) return;
    setActiveTab('score');
    setOpenChart(null);
    setShowDeleteConfirm(false);
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => dialogRef.current?.focus());
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus();
    };
  }, [session?.id, visible, onClose]);

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
        {loading ? <div className="flex items-center justify-center h-32"><span className="text-text-muted text-sm" role="status">Loading analysis…</span></div> : content}
      </div>
    </div>,
    document.body,
  );
}
