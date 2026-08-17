import { useEffect, useState } from 'react';
import {
  activateWaitingUpdate,
  dismissUpdateNotice,
  getUpdateState,
  subscribeToUpdates,
  type UpdateState,
} from '../../utils/updateCoordinator';

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateState>(getUpdateState());

  useEffect(() => subscribeToUpdates(setUpdate), []);

  if (update.phase === 'idle' || update.phase === 'checking') return null;

  const isDeferred = update.phase === 'deferred';
  const isActivating = update.phase === 'activating';
  const isError = update.phase === 'error';
  const blockingText = update.blockingActivities.length > 0
    ? ` Active: ${update.blockingActivities.join(', ')}.`
    : '';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9999] border-b px-3 py-2 shadow-lg
        ${isError
          ? 'bg-danger-dim border-danger/40'
          : 'bg-bg-raised/98 border-border-emphasis'
        }`}
      role={isError ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="max-w-xl mx-auto flex items-center gap-2">
        <p className={`text-xs leading-relaxed flex-1 ${isError ? 'text-danger' : 'text-text-primary'}`}>
          {update.message}{isDeferred ? blockingText : ''}
        </p>

        {!isError && !isActivating && (
          <button
            type="button"
            onClick={() => activateWaitingUpdate()}
            disabled={isDeferred}
            className="min-h-[40px] px-3 rounded-lg bg-accent text-bg-primary text-xs font-bold
                       disabled:bg-bg-surface disabled:text-text-secondary disabled:cursor-not-allowed
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Update
          </button>
        )}

        {!isActivating && (
          <button
            type="button"
            onClick={dismissUpdateNotice}
            aria-label="Dismiss update notice"
            className="min-w-[40px] min-h-[40px] rounded-lg text-text-secondary
                       active:bg-bg-surface focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
