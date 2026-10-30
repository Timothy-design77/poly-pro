import { useEffect, useState } from 'react';
import { useUpdateStore } from '../../store/update-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { isCriticalActivityActive, subscribeCriticalActivities } from '../../utils/critical-activity';
export function UpdateBanner() {
  const { available, updating, error } = useUpdateStore();
  const playing = useMetronomeStore((state) => state.playing);
  const [busy, setBusy] = useState(isCriticalActivityActive);
  useEffect(() => subscribeCriticalActivities((activities) => setBusy(activities.size > 0)), []);
  if (!available && !updating && !error) return null;
  return <div className="fixed top-0 left-0 right-0 z-40 bg-bg-surface border-b border-border-subtle p-2 pt-[max(8px,env(safe-area-inset-top))] flex items-center justify-center gap-3 text-xs text-text-primary" role="status">
    <span>{error || (updating ? 'Updating Poly Pro…' : 'An update is ready.')}</span>
    {available && !updating && <button disabled={busy || playing} className="ui-button ui-button-primary" onClick={() => window.dispatchEvent(new Event('polypro:apply-update'))}>{busy || playing ? 'Finish practice to update' : 'Update now'}</button>}
  </div>;
}
