import { useMemo } from 'react';
import type { HitEventsRecord, SessionRecord } from '../../store/db';
interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord;
  playheadFraction: number;
  onChange: (next: HitEventsRecord) => void;
}

const MIN_GAP_S = 0.001;

export function HitEditor({ session, hitEvents, playheadFraction, onChange }: Props) {
  const playheadS = playheadFraction * (session.durationMs / 1000);

  const nearest = useMemo(() => {
    if (hitEvents.rawOnsets.length === 0) return null;
    let index = 0;
    let distance = Infinity;
    hitEvents.rawOnsets.forEach((hit, i) => {
      const value = Math.abs(hit.time - playheadS);
      if (value < distance) { distance = value; index = i; }
    });
    return { index, hit: hitEvents.rawOnsets[index], distance };
  }, [hitEvents.rawOnsets, playheadS]);

  const replaceRaw = (rawOnsets: HitEventsRecord['rawOnsets'], scoredOnsets = hitEvents.scoredOnsets) => {
    onChange({ ...hitEvents, scoredOnsets, rawOnsets: [...rawOnsets].sort((a, b) => a.time - b.time) });
  };

  const nudgedTime = (deltaMs: number) => {
    if (!nearest) return null;
    const time = Math.max(0, Math.min(session.durationMs / 1000, nearest.hit.time + deltaMs / 1000));
    if (time === nearest.hit.time || hitEvents.rawOnsets.some((hit, index) => index !== nearest.index && Math.abs(hit.time - time) < MIN_GAP_S)) return null;
    return time;
  };
  const canAdd = !hitEvents.rawOnsets.some((hit) => Math.abs(hit.time - playheadS) < MIN_GAP_S);

  const nudgeNearest = (deltaMs: number) => {
    const time = nudgedTime(deltaMs);
    if (!nearest || time === null) return;
    const next = hitEvents.rawOnsets.slice();
    next[nearest.index] = { ...next[nearest.index], time };
    replaceRaw(next, hitEvents.scoredOnsets.map((hit) => Math.abs(hit.time - nearest.hit.time) < MIN_GAP_S
      ? { ...hit, time: next[nearest.index].time } : hit));
  };

  const removeNearest = () => {
    if (nearest) replaceRaw(hitEvents.rawOnsets.filter((_, index) => index !== nearest.index));
  };

  const addAtPlayhead = () => {
    if (!canAdd) return;
    replaceRaw([...hitEvents.rawOnsets, { time: playheadS, peak: nearest?.hit.peak ?? 0.5, flux: nearest?.hit.flux ?? 0, isFlam: false }]);
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-raised/40 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-xs font-semibold text-text-secondary">Edit hits</p><p className="text-xs text-text-muted">Seek to a hit to move or remove it, or add a missed hit at the playhead. Undo reverses a correction. Save changes keeps your edits.</p></div>
        <span className="text-xs font-mono text-text-muted">{hitEvents.rawOnsets.length} hits</span>
      </div>
      <div className="flex items-center justify-between rounded bg-bg-surface px-2 py-1.5">
        <span className="text-xs text-text-muted">Playhead {(playheadS * 1000).toFixed(0)}ms</span>
        <span className="text-xs font-mono text-text-secondary">{nearest ? `Nearest ${(nearest.hit.time * 1000).toFixed(0)}ms · Δ ${(nearest.distance * 1000).toFixed(0)}ms` : 'No detections'}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => nudgeNearest(-5)} disabled={nudgedTime(-5) === null} className="min-h-[44px] rounded bg-bg-raised text-xs text-text-secondary disabled:opacity-30">−5ms</button>
        <button onClick={() => nudgeNearest(5)} disabled={nudgedTime(5) === null} className="min-h-[44px] rounded bg-bg-raised text-xs text-text-secondary disabled:opacity-30">+5ms</button>
        <button onClick={removeNearest} disabled={!nearest} className="min-h-[44px] rounded bg-danger-dim text-xs text-danger disabled:opacity-30">Remove</button>
        <button onClick={addAtPlayhead} disabled={!canAdd} className="min-h-[44px] rounded bg-bg-raised text-xs text-text-primary disabled:opacity-30">Add Here</button>
      </div>
    </div>
  );
}
