/**
 * SessionDetailPage — Full-screen overlay with 4 tap-only tabs.
 *
 * Rendered via React Portal at document.body level — this is critical
 * because the overlay is opened from ProgressPage which sits inside
 * SwipeNavigation. Without a portal, touch events bubble through the
 * React tree to SwipeNavigation and cause page swipes.
 */

import { useState, useEffect } from 'react';
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
}

const TABS: { id: TabId; label: string; help: string }[] = [
  { id: 'score', label: 'Score', help: 'Overall session score, consistency metrics, and auto-generated insights about your playing.' },
  { id: 'timeline', label: 'Timeline', help: 'DAW-style view of your recording with onset markers, metronome grid, and scoring controls.' },
  { id: 'charts', label: 'Charts', help: 'Detailed charts showing timing distribution, fatigue, per-beat analysis, drift, and push/pull patterns.' },
  { id: 'tune', label: 'Tune', help: 'Adjust analysis parameters and see how they affect your score in real-time. Changes don\'t affect saved data.' },
];

export function SessionDetailPage({ session, visible, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('score');
  const [hitEvents, setHitEvents] = useState<HitEventsRecord | null>(null);
  const [loading, setLoading] = useState(false);

  // Load hit events when session changes
  useEffect(() => {
    if (!session || !visible) {
      setHitEvents(null);
      return;
    }
    setLoading(true);
    db.getHitEvents(session.id).then((events) => {
      if (events) {
        console.log(`Loaded hitEvents for ${session.id}: ${events.scoredOnsets.length} scored, ${events.rawOnsets.length} raw`);
      } else {
        console.warn(`No hitEvents found for session ${session.id}`);
      }
      setHitEvents(events ?? null);
      setLoading(false);
    }).catch((err) => {
      console.error('Failed to load hit events:', err);
      setHitEvents(null);
      setLoading(false);
    });
  }, [session?.id, visible]);

  // Reset to score tab when opening a new session
  useEffect(() => {
    if (visible) setActiveTab('score');
  }, [session?.id, visible]);

  if (!visible || !session) return null;

  const dateStr = new Date(session.date).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
  const timeStr = new Date(session.date).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });

  // Portal: render at document.body, outside SwipeNavigation's DOM tree
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
        <div className="w-12" />
      </div>

      {/* Tab bar — tap only, no swiping */}
      <div className="flex px-4 gap-1 shrink-0 mb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 pb-20">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-text-muted text-sm">Loading analysis…</span>
          </div>
        ) : (
          <>
            {activeTab === 'score' && (
              <ScoreTab session={session} hitEvents={hitEvents} />
            )}
            {activeTab === 'timeline' && (
              <TimelineTab session={session} hitEvents={hitEvents} />
            )}
            {activeTab === 'charts' && (
              <ChartsTab session={session} hitEvents={hitEvents} />
            )}
            {activeTab === 'tune' && (
              <TuneTab session={session} hitEvents={hitEvents} />
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
