import { useMemo, useState } from 'react';
import type { HitEventsRecord, SessionRecord } from '../../store/db';
import * as db from '../../store/db';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord;
  originalHitEvents: HitEventsRecord;
  playheadFraction: number;
  onChange: (next: HitEventsRecord) => void;
}

const MIN_GAP_S = 0.001;

export function HitEditor({ session, hitEvents, originalHitEvents, playheadFraction, onChange }: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const playheadS = playheadFraction * (session.durationMs / 1000);

  const nearest = useMemo(() => {
    if (hitEvents.rawOnsets.length === 0) return null;
    let index = 0;
    let distance = Infinity;
    hitEvents.rawOnsets.forEach((hit, i) => {
      const d = Math.abs(hit.time - playheadS);
      if (d < distance) {
        distance = d;
        index = i;
      }
    });
    return { index, hit: hitEvents.rawOnsets[index], distance };
  }, [hitEvents.rawOnsets, playheadS]);

  const replaceRaw = (rawOnsets: HitEventsRecord['rawOnsets']) => {
    setSaved(false);
    onChange({ ...hitEvents, rawOnsets: [...rawOnsets].sort((a, b) => a.time - b.time) });
  };

  const nudgeNearest = (deltaMs: number) => {
    if (!nearest) return;
    const next = hitEvents.rawOnsets.slice();
    const durationS = session.durationMs / 1000;
    next[nearest.index] = {
      ...next[nearest.index],
      time: Math.max(0, Math.min(durationS, next[nearest.index].time + deltaMs / 1000)),
    };
    replaceRaw(next);
  };

  const removeNearest = () => {
    if (!nearest) return;
    replaceRaw(hitEvents.rawOnsets.filter((_, i) => i !== nearest.index));
  };

  const addAtPlayhead = () => {
    const tooClose = hitEvents.rawOnsets.some((hit) => Math.abs(hit.time - playheadS) < MIN_GAP_S);
    if (tooClose) return;
    replaceRaw([
      ...hitEvents.rawOnsets,
      { time: playheadS, peak: nearest?.hit.peak ?? 0.5, flux: nearest?.hit.flux ?? 0, isFlam: false },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await db.putHitEvents(hitEvents);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setSaved(false);
    onChange({
      ...originalHitEvents,
      rawOnsets: originalHitEvents.rawOnsets.map((hit) => ({ ...hit })),
      scoredOnsets: originalHitEvents.scoredOnsets.map((hit) => ({ ...hit })),
    });
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-raised/40 p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold text-text-secondary">Detection Editor</p>
          <p className="text-[9px] text-text-muted">Move the playhead near a hit, then correct the nearest detection. Source audio is unchanged.</p>
        </div>
        <span className="text-[9px] font-mono text-text-muted">{hitEvents.rawOnsets.length} hits</span>
      </div>

      <div className="flex items-center justify-between rounded bg-black/10 px-2 py-1.5">
        <span className="text-[9px] text-text-muted">Playhead {(playheadS * 1000).toFixed(0)}ms</span>
        <span className="text-[9px] font-mono text-text-secondary">
          {nearest ? `Nearest ${(nearest.hit.time * 1000).toFixed(0)}ms · Δ ${(nearest.distance * 1000).toFixed(0)}ms` : 'No detections'}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => nudgeNearest(-5)} disabled={!nearest} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/60 disabled:opacity-30">−5ms</button>
        <button onClick={() => nudgeNearest(5)} disabled={!nearest} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/60 disabled:opacity-30">+5ms</button>
        <button onClick={removeNearest} disabled={!nearest} className="min-h-[34px] rounded bg-danger-dim text-[10px] text-danger disabled:opacity-30">Remove</button>
        <button onClick={addAtPlayhead} className="min-h-[34px] rounded bg-white/5 text-[10px] text-white/70">Add Here</button>
      </div>

      <div className="flex gap-2">
        <button onClick={reset} className="flex-1 min-h-[34px] rounded border border-border-subtle text-[10px] text-text-muted">Reset</button>
        <button onClick={save} disabled={saving} className="flex-1 min-h-[34px] rounded bg-accent/20 text-[10px] font-bold text-accent disabled:opacity-50">{saving ? 'Saving…' : saved ? 'Saved' : 'Save Corrections'}</button>
      </div>
    </div>
  );
}
