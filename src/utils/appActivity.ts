export type CriticalActivity =
  | 'recording'
  | 'analysis'
  | 'backup-export'
  | 'backup-import'
  | 'instrument-training';

const activityCounts = new Map<CriticalActivity, number>();
const ACTIVITY_EVENT = 'poly-pro:critical-activity-change';

function emitChange() {
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, {
    detail: getCriticalActivities(),
  }));
}

/**
 * Acquire a reference-counted critical-activity lock.
 * The returned release function is idempotent.
 */
export function acquireCriticalActivity(activity: CriticalActivity): () => void {
  activityCounts.set(activity, (activityCounts.get(activity) ?? 0) + 1);
  emitChange();

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const next = Math.max(0, (activityCounts.get(activity) ?? 1) - 1);
    if (next === 0) activityCounts.delete(activity);
    else activityCounts.set(activity, next);
    emitChange();
  };
}

export function getCriticalActivities(): CriticalActivity[] {
  return [...activityCounts.keys()];
}

export function hasCriticalActivity(): boolean {
  return activityCounts.size > 0;
}

export function subscribeToCriticalActivity(
  listener: (activities: CriticalActivity[]) => void,
): () => void {
  const handler = (event: Event) => {
    const custom = event as CustomEvent<CriticalActivity[]>;
    listener(custom.detail ?? getCriticalActivities());
  };

  window.addEventListener(ACTIVITY_EVENT, handler);
  return () => window.removeEventListener(ACTIVITY_EVENT, handler);
}
