import { useMemo, useState } from 'react';
import type { HitEventsRecord, SessionRecord } from '../../store/db';
import { PrecisionSlider } from '../ui/PrecisionSlider';
import { HelpTip } from '../ui/HelpTip';
import { forEachClickBeat } from './timeline/timeline-shared';

interface Props {
  session: SessionRecord;
  hitEvents: HitEventsRecord | null;
  offsetMs: number;
  playheadSeconds?: number;
  playing?: boolean;
  onChange: (offsetMs: number) => void;
  onSeek?: (fraction: number) => void;
}

function nearestIndex(times: number[], target: number): number {
  let nearest = 0;
  for (let i = 1; i < times.length; i++) if (Math.abs(times[i] - target) < Math.abs(times[nearest] - target)) nearest = i;
  return nearest;
}
const stamp = (seconds: number) => `${seconds.toFixed(3)} s`;
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} ms`;

/** A single explicit reference sets a uniform offset, never a fitted performance. */
export function ClickSyncControls({ session, hitEvents, offsetMs, playheadSeconds = 0, playing = false, onChange, onSeek }: Props) {
  const beats = useMemo(() => {
    const result: number[] = [];
    forEachClickBeat(session, 0, ({ beatTime }) => result.push(beatTime), hitEvents?.gridBeats);
    return result;
  }, [session.bpm, session.meter, session.subdivision, session.durationMs, hitEvents?.gridBeats]);
  const hits = useMemo(() => (hitEvents?.rawOnsets ?? []).map((hit) => hit.time).sort((a, b) => a - b), [hitEvents?.rawOnsets]);
  const [beatIndex, setBeatIndex] = useState(() => nearestIndex(beats, playheadSeconds - offsetMs / 1000));
  const [hitIndex, setHitIndex] = useState(() => nearestIndex(hits, playheadSeconds));
  const selectedBeat = Math.min(beatIndex, beats.length - 1);
  const selectedHit = Math.min(hitIndex, hits.length - 1);
  const beat = beats[selectedBeat];
  const hit = hits[selectedHit];
  const proposed = Math.round((hit - beat) * 10_000) / 10;
  const canAlign = Number.isFinite(proposed) && Math.abs(proposed) <= 10_000;
  const update = (value: number) => onChange(Math.max(-10_000, Math.min(10_000, Math.round(value * 10) / 10)));
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Click sync</h2>
      <HelpTip text="Moves the playback click and scoring grid together against the unchanged recording. Positive values move the click later. Save changes to keep this take’s alignment. A reference hit should be one you intended to play on that beat; this does not measure device latency independently." />
    </div>
    <PrecisionSlider ariaLabel="Click offset" min={Math.min(-300, offsetMs)} max={Math.max(600, offsetMs)} step={0.1}
      value={offsetMs} onChange={update} formatValue={signed} showValue />
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="ui-button ui-button-secondary" aria-label="Move click 1 millisecond earlier" onClick={() => update(offsetMs - 1)}>← Earlier 1 ms</button>
      <button type="button" className="ui-button ui-button-secondary" aria-label="Move click 1 millisecond later" onClick={() => update(offsetMs + 1)}>Later 1 ms →</button>
    </div>
    <p className="text-xs text-text-secondary">Listen and adjust. Save changes to keep this take’s sync.</p>
    {onSeek && <details className="border-t border-border-subtle pt-2">
      <summary className="min-h-[44px] flex items-center cursor-pointer text-sm font-semibold">Align to a recorded hit</summary>
      <p className="text-xs text-text-secondary mb-3">Choose a clear hit and the click it belongs to. This shifts the whole grid.</p>
      <fieldset disabled={playing || !beats.length || !hits.length} className="space-y-3 disabled:opacity-50">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-text-secondary">Reference click
            <input aria-label="Reference click" type="number" min={1} max={beats.length} step={1} value={selectedBeat < 0 ? '' : selectedBeat + 1}
              onChange={(event) => { const value = event.currentTarget.valueAsNumber; setBeatIndex(Number.isFinite(value) ? Math.max(0, Math.min(beats.length - 1, Math.round(value) - 1)) : -1); }}
              className="w-full min-h-[44px] rounded-xl border border-border-subtle px-3 mt-1 bg-bg-surface text-sm" />
            <span className="block mt-1 tabular-nums">{Number.isFinite(beat) ? stamp(beat) : 'No clicks'}</span>
          </label>
          <label className="text-xs text-text-secondary">Recorded hit
            <input aria-label="Recorded hit" type="number" min={1} max={hits.length} step={1} value={selectedHit < 0 ? '' : selectedHit + 1}
              onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (!Number.isFinite(value)) { setHitIndex(-1); return; } const index = Math.max(0, Math.min(hits.length - 1, Math.round(value) - 1)); setHitIndex(index); onSeek(hits[index] / (session.durationMs / 1000)); }}
              className="w-full min-h-[44px] rounded-xl border border-border-subtle px-3 mt-1 bg-bg-surface text-sm" />
            <span className="block mt-1 tabular-nums">{Number.isFinite(hit) ? stamp(hit) : 'No detected hits'}</span>
          </label>
        </div>
        <button type="button" className="ui-button ui-button-secondary w-full" onClick={() => { const index = nearestIndex(hits, playheadSeconds); setHitIndex(index); onSeek(hits[index] / (session.durationMs / 1000)); }}>Use hit nearest playhead</button>
        <button type="button" disabled={!canAlign} className="ui-button ui-button-primary w-full" onClick={() => update(proposed)}>Align selected hit{canAlign ? ` · ${signed(proposed)}` : ''}</button>
      </fieldset>
      {playing && <p className="text-xs text-text-muted mt-2">Pause to choose a reference hit.</p>}
      {!hits.length && <p className="text-xs text-text-muted mt-2">No detected hits. Adjust by ear or add a hit in Edit hits.</p>}
    </details>}
  </div>;
}
