import { useState, useEffect, useCallback } from 'react';
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
  { id: 'score', label: 'Score', help: 'Overall session score, consistency metrics, and auto-generated insights about your playing.' },
  { id: 'timeline', label: 'Timeline', help: 'DAW-style view of your recording with onset markers, metronome grid, playback, and scoring alignment.' },
  { id: 'charts', label: 'Charts', help: 'Timing distribution, fatigue, per-beat, drift, push/pull, swing, instrument, and velocity/dynamics charts.' },
  { id: 'tune', label: 'Tune', help: 'Adjust analysis parameters and re-score the session using the stored beat grid and hit data.' },
];

export function SessionDetailPage({ session, visible, onClose, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('score');
  const [hitEvents, setHitEvents] = useState<HitEventsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    if (!session || !visible) {
      setHitEvents(null);
      return;
    }

    setLoading(true);
    db.getHitEvents(session.id)
      .then((events) => {
        setHitEvents(events ?? null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Failed to load hit events:', error);
        setHitEvents(null);
        setLoading(false);
      });
  }, [session?.id, visible]);

  useEffect(() => {
    if (visible) {
      setActiveTab('score');
      setOpenChart(null);
      setShowDeleteConfirm(false);
    }
  }, [session?.id, visible]);

  useEffect(() => {
    if (!visible) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible || !session) return null;

  const dateStr = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
  const timeStr = new Date(session.date).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
  const activeHelp = TABS.find((tab) => tab.id === activeTab)?.help ?? '';

  const content = (() => {
    if (activeTab === 'score') {
      return <ScoreTab session={session} hitEvents={hitEvents} onNavigateChart={handleNavigateChart} />;
    }
    if (activeTab === 'timeline') {
      return <TimelineTab session={session} hitEvents={hitEvents} />;
    }
    if (activeTab === 'charts') {
      return <ChartsTab session={session} hitEvents={hitEvents} autoOpenSection={openChart} />;
    }
    return <TuneTab session={session} hitEvents={hitEvents} />;
  })();

  return createPortal(
    <div data-no-swipe className="fixed inset-0 z-50 flex flex-col bg-bg-primary animate-sheet-up">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 shrink-0 border-b border-border-subtle bg-bg-surface">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[40px] text-sm font-semibold text-text-primary touch-manipulation px-1"
        >
          ← Back
        </button>
        <span className="text-xs text-text-muted flex items-center gap-1.5 text-center">
          {dateStr} {timeStr}
          <HelpTip text={activeHelp} />
        </span>
        {onDelete ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-[40px] h-[40px] flex items-center justify-center text-text-secondary
                       touch-manipulation rounded-lg active:bg-danger-dim active:text-danger"
            aria-label="Delete session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        ) : (
          <div className="w-[40px]" />
        )}
      </div>

      {showDeleteConfirm && (
        <div className="mx-4 mt-3 bg-danger-dim border border-danger/30 rounded-lg p-3 shrink-0">
          <p className="text-danger text-xs font-medium mb-2">Delete this session and all its data?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 min-h-[42px] border border-border-subtle bg-bg-surface text-text-secondary rounded-lg text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="flex-1 min-h-[42px] bg-danger text-white rounded-lg text-xs font-semibold"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 px-4 py-2 shrink-0 bg-bg-primary">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`min-h-[42px] rounded-lg text-[11px] font-bold tracking-wide touch-manipulation select-none border
              ${activeTab === tab.id
                ? 'bg-accent text-bg-primary border-accent'
                : 'bg-bg-surface text-text-secondary border-border-subtle active:bg-bg-raised'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 overscroll-contain">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-text-muted text-sm">Loading analysis…</span>
          </div>
        ) : content}
      </div>
    </div>,
    document.body,
  );
}
