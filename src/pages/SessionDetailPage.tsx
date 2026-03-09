/**
 * SessionDetailPage — Full-screen overlay with 4 swipeable tabs.
 *
 * Rendered via React Portal at document.body level.
 * Swipe left/right to navigate between tabs.
 * Timeline tab's canvas handles its own touch events (scroll/pinch)
 * so swipes within the canvas don't trigger tab switches.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SessionRecord, HitEventsRecord } from '../store/db';
import * as db from '../store/db';
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
  { id: 'timeline', label: 'Timeline', help: 'DAW-style view of your recording with onset markers, metronome grid, and scoring controls.' },
  { id: 'charts', label: 'Charts', help: 'Detailed charts: timing distribution, fatigue, per-beat, drift, push/pull, swing analysis, and velocity/dynamics.' },
  { id: 'tune', label: 'Tune', help: 'Adjust analysis parameters and see how they affect your score in real-time. Changes don\'t affect saved data.' },
];

const TAB_IDS: TabId[] = ['score', 'timeline', 'charts', 'tune'];
const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;

export function SessionDetailPage({ session, visible, onClose, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('score');
  const [hitEvents, setHitEvents] = useState<HitEventsRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // ─── Swipe state ───
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTimeRef = useRef(0);
  const directionRef = useRef<'h' | 'v' | null>(null);

  const handleNavigateChart = useCallback((chartId: string) => {
    setOpenChart(chartId);
    setActiveTab('charts');
  }, []);

  const handleDelete = useCallback(async () => {
    if (!session) return;
    try {
      await db.deleteRecording(session.id);
      await db.deleteHitEvents(session.id);
      await db.deleteSession(session.id);
      setShowDeleteConfirm(false);
      onDelete?.(session.id);
      onClose();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [session, onDelete, onClose]);

  useEffect(() => {
    if (!session || !visible) {
      setHitEvents(null);
      return;
    }
    setLoading(true);
    db.getHitEvents(session.id).then((events) => {
      setHitEvents(events ?? null);
      setLoading(false);
    }).catch((err) => {
      console.error('Failed to load hit events:', err);
      setHitEvents(null);
      setLoading(false);
    });
  }, [session?.id, visible]);

  useEffect(() => {
    if (visible) {
      setActiveTab('score');
      setDragX(0);
      setShowDeleteConfirm(false);
    }
  }, [session?.id, visible]);

  // ─── Swipe handlers ───
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Don't capture if touch starts on a canvas (timeline has its own handler)
    const target = e.target as HTMLElement;
    if (target.tagName === 'CANVAS') return;

    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    startTimeRef.current = Date.now();
    directionRef.current = null;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;

    const dx = e.touches[0].clientX - startXRef.current;
    const dy = e.touches[0].clientY - startYRef.current;

    // Lock direction on first significant movement
    if (directionRef.current === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        directionRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      return;
    }

    if (directionRef.current === 'h') {
      const tabIdx = TAB_IDS.indexOf(activeTab);
      // Rubber-band at edges
      let adj = dx;
      if ((tabIdx === 0 && dx > 0) || (tabIdx === TAB_IDS.length - 1 && dx < 0)) {
        adj = dx * 0.2;
      }
      setDragX(adj);
    }
  }, [isDragging, activeTab]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    if (directionRef.current === 'h') {
      const elapsed = Math.max(1, Date.now() - startTimeRef.current);
      const velocity = Math.abs(dragX) / elapsed;
      const tabIdx = TAB_IDS.indexOf(activeTab);

      let nextIdx = tabIdx;
      if (Math.abs(dragX) > SWIPE_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
        if (dragX > 0 && tabIdx > 0) nextIdx = tabIdx - 1;
        else if (dragX < 0 && tabIdx < TAB_IDS.length - 1) nextIdx = tabIdx + 1;
      }
      setActiveTab(TAB_IDS[nextIdx]);
    }

    directionRef.current = null;
    setDragX(0);
  }, [isDragging, dragX, activeTab]);

  if (!visible || !session) return null;

  const dateStr = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
  const timeStr = new Date(session.date).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  const tabIdx = TAB_IDS.indexOf(activeTab);
  const pageWidth = 100 / TAB_IDS.length;
  const trackOffset = -(tabIdx * pageWidth);
  const dragPercent = isDragging && directionRef.current === 'h'
    ? (dragX / (window.innerWidth || 400)) * pageWidth
    : 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: '#0C0C0E' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={onClose}
          className="text-sm text-text-secondary touch-manipulation py-2 px-1"
        >
          ← Back
        </button>
        <span className="text-sm text-text-muted flex items-center gap-1.5">
          {dateStr} {timeStr}
          <HelpTip text={TABS.find((t) => t.id === activeTab)?.help ?? ''} />
        </span>
        {onDelete ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-text-muted touch-manipulation py-2 px-1 hover:text-danger transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        ) : (
          <div className="w-12" />
        )}
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="mx-4 mb-2 bg-danger-dim border border-danger/30 rounded-md p-3 shrink-0">
          <p className="text-danger text-xs font-medium mb-2">
            Delete this session and all its data?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[40px]"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="flex-1 py-2 bg-danger text-white rounded-md text-xs font-medium min-h-[40px]"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex px-4 gap-1 shrink-0 mb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setDragX(0); }}
            className={`
              flex-1 py-2 rounded-lg text-xs font-semibold tracking-wide
              touch-manipulation select-none transition-colors
              ${activeTab === tab.id
                ? 'bg-[rgba(255,255,255,0.12)] text-text-primary'
                : 'text-text-muted active:bg-bg-raised'}
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Swipeable tab content */}
      <div
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {loading ? (
          <div className="flex items-center justify-center h-32 px-4">
            <span className="text-text-muted text-sm">Loading analysis…</span>
          </div>
        ) : (
          <div
            className="flex h-full will-change-transform"
            style={{
              width: `${TAB_IDS.length * 100}%`,
              transform: `translateX(${trackOffset + dragPercent}%)`,
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            }}
          >
            {TAB_IDS.map((tabId) => (
              <div
                key={tabId}
                className="h-full overflow-y-auto px-4 pb-20"
                style={{ width: `${pageWidth}%` }}
              >
                {tabId === 'score' && (
                  <ScoreTab session={session} hitEvents={hitEvents} onNavigateChart={handleNavigateChart} />
                )}
                {tabId === 'timeline' && (
                  <TimelineTab session={session} hitEvents={hitEvents} />
                )}
                {tabId === 'charts' && (
                  <ChartsTab session={session} hitEvents={hitEvents} autoOpenSection={openChart} />
                )}
                {tabId === 'tune' && (
                  <TuneTab session={session} hitEvents={hitEvents} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
