/**
 * TuneTab — full analysis controls with live chart updating.
 *
 * Uses the shared ScoringControls component with compact=false
 * to show both basic and advanced tiers.
 */

import type { SessionRecord, HitEventsRecord } from '../../store/db';
import { ScoringControls } from './ScoringControls';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
}

export function TuneTab({ session, hitEvents }: Props) {
  if (!hitEvents || !session.analyzed) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-text-muted text-sm text-center">
          {!session.analyzed
            ? 'Record a session to tune analysis parameters'
            : 'Onset data not found — try recording a new session'}
        </p>
      </div>
    );
  }

  // Check if raw audio still exists (for re-analysis)
  // If not, sliders are informational only

  return (
    <ScoringControls
      session={session}
      hitEvents={hitEvents}
      compact={false}
    />
  );
}
