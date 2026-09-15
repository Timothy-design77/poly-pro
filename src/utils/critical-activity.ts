export type CriticalActivity = 'recording' | 'analysis' | 'backup' | 'import' | 'calibration';

type Listener = (active: ReadonlySet<CriticalActivity>) => void;

const counts = new Map<CriticalActivity, number>();
const listeners = new Set<Listener>();

function snapshot(): ReadonlySet<CriticalActivity> {
  return new Set([...counts.entries()].filter(([, count]) => count > 0).map(([name]) => name));
}

function notify(): void {
  const active = snapshot();
  for (const listener of listeners) listener(active);
}

export function beginCriticalActivity(name: CriticalActivity): () => void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
  notify();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = Math.max(0, (counts.get(name) ?? 1) - 1);
    if (next === 0) counts.delete(name);
    else counts.set(name, next);
    notify();
  };
}

export function isCriticalActivityActive(): boolean {
  for (const count of counts.values()) if (count > 0) return true;
  return false;
}

export function getCriticalActivities(): ReadonlySet<CriticalActivity> {
  return snapshot();
}

export function subscribeCriticalActivities(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => listeners.delete(listener);
}
