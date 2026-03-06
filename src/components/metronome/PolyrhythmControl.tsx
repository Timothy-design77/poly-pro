import { useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

/**
 * Add/remove polyrhythm tracks.
 * Shows current tracks with remove buttons.
 * "+ Add Track" button to add a new layer with configurable beat count.
 */
export function PolyrhythmControl() {
  const tracks = useMetronomeStore((s) => s.tracks);
  const meterNumerator = useMetronomeStore((s) => s.meterNumerator);
  const addTrack = useMetronomeStore((s) => s.addTrack);
  const removeTrack = useMetronomeStore((s) => s.removeTrack);
  const setTrackMuted = useMetronomeStore((s) => s.setTrackMuted);
  const [newBeats, setNewBeats] = useState(3);

  const extraTracks = tracks.filter((t) => t.id !== 'track-0');

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-3">
      <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
        Polyrhythm
      </div>

      {/* Primary track info */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted">Main:</span>
          <span className="font-mono text-xs text-text-primary font-bold">{meterNumerator}</span>
        </div>
        {extraTracks.length > 0 && (
          <span className="text-[10px] text-text-muted">
            {meterNumerator}:{extraTracks.map(t => t.beats).join(':')}
          </span>
        )}
      </div>

      {/* Extra tracks */}
      {extraTracks.map((track, i) => (
        <div key={track.id} className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-text-muted w-[52px]">Track {i + 2}:</span>
          <span className="font-mono text-xs text-text-primary font-bold">{track.beats} beats</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setTrackMuted(track.id, !track.muted)}
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold
                ${track.muted ? 'text-danger bg-danger-dim' : 'text-text-muted bg-bg-raised'}`}
            >
              {track.muted ? 'MUTED' : 'ON'}
            </button>
            <button
              onClick={() => removeTrack(track.id)}
              className="w-[22px] h-[22px] flex items-center justify-center rounded
                         text-text-muted active:bg-bg-raised"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Add track */}
      {tracks.length < 4 && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border-subtle">
          <div className="flex items-center bg-bg-primary border border-border-subtle rounded-md overflow-hidden">
            <button
              onClick={() => setNewBeats(Math.max(2, newBeats - 1))}
              className="w-[24px] h-[26px] flex items-center justify-center text-text-muted active:bg-bg-raised text-xs"
            >−</button>
            <span className="w-[24px] text-center font-mono text-xs text-text-primary">{newBeats}</span>
            <button
              onClick={() => setNewBeats(Math.min(16, newBeats + 1))}
              className="w-[24px] h-[26px] flex items-center justify-center text-text-muted active:bg-bg-raised text-xs"
            >+</button>
          </div>
          <button
            onClick={() => addTrack(newBeats)}
            className="flex-1 h-[28px] rounded-md border border-dashed border-border-subtle
                       text-[10px] font-bold text-text-muted active:bg-bg-raised
                       flex items-center justify-center gap-1"
          >
            + Add Track
          </button>
        </div>
      )}
    </div>
  );
}
