/**
 * SessionDetailPage — Full-screen overlay with 4 tap-only tabs.
 *
 * Slides in from right. ← back button to exit.
 * Tabs: Score | Timeline | Charts | Tune
 * No horizontal swiping inside — avoids gesture conflicts.
 */

import { useState, useEffect } from 'react';
import type { SessionRecord, HitEventsRecord } from '../store/db';
import * as db from '../store/db';
import { ScoreTab } from '../components/session/ScoreTab';
import { TimelineTab } from '../components/session/TimelineTab';
import { ChartsTab } from '../components/session/ChartsTab';
import { TuneTab } from '../components/session/TuneTab';

type TabId = 'score' | 'timeline' | 'charts' | 'tune';

interface Props {
  session: SessionRecord | null;
  visible: boolean;
  onClose: () => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'score', label: 'Score' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'charts', label: 'Charts' },
  { id: 'tune', label: 'Tune' },
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

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: '#0C0C0E' }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <button
          onClick={onClose}
          className="text-sm text-text-secondary touch-manipulation py-2 px-1"
        >
          ← Back
        </button>
        <span className="text-sm text-text-muted">
          {dateStr} {timeStr}
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
      <div className="flex-1 overflow-y-auto px-4 pb-8">
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
    </div>
  );
}
