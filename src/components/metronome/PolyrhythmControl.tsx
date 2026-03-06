import { useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

/**
 * Polyrhythm track management — lives inside a CollapsibleCard.
 * Enlarged controls for easy mobile use.
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
    <div>
      {/* Primary track info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">Main track:</span>
          <span className="font-mono text-base text-text-primary font-bold">{meterNumerator} beats</span>
        </div>
        {extraTracks.length > 0 && (
          <span className="font-mono text-xs text-text-muted">
            {meterNumerator}:{extraTracks.map(t => t.beats).join(':')}
          </span>
        )}
      </div>

      {/* Extra tracks */}
      {extraTracks.map((track, i) => (
        <div key={track.id} className="flex items-center gap-3 mb-2 bg-bg-surface rounded-xl px-3 py-2.5 border border-border-subtle">
          <span className="text-sm text-text-secondary flex-1">Track {i + 2}</span>
          <span className="font-mono text-sm text-text-primary font-bold">{track.beats} beats</span>
          <button
            onClick={() => setTrackMuted(track.id, !track.muted)}
            className={`h-[36px] px-3 rounded-lg text-xs font-bold touch-manipulation
              ${track.muted
                ? 'text-danger bg-danger-dim border border-danger/20'
                : 'text-text-secondary bg-bg-raised border border-border-subtle'}`}
          >
            {track.muted ? 'MUTED' : 'ON'}
          </button>
          <button
            onClick={() => removeTrack(track.id)}
            className="w-[36px] h-[36px] flex items-center justify-center rounded-lg
                       bg-bg-raised border border-border-subtle text-text-muted
                       active:bg-danger-dim touch-manipulation"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}

      {/* Add track */}
      {tracks.length < 4 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <button
              onClick={() => setNewBeats(Math.max(2, newBeats - 1))}
              className="w-[40px] h-[44px] flex items-center justify-center text-text-secondary
                         active:bg-bg-raised text-lg font-bold touch-manipulation"
            >−</button>
            <span className="w-[36px] text-center font-mono text-base text-text-primary font-bold">{newBeats}</span>
            <button
              onClick={() => setNewBeats(Math.min(16, newBeats + 1))}
              className="w-[40px] h-[44px] flex items-center justify-center text-text-secondary
                         active:bg-bg-raised text-lg font-bold touch-manipulation"
            >+</button>
          </div>
          <button
            onClick={() => addTrack(newBeats)}
            className="flex-1 h-[44px] rounded-xl border-2 border-dashed border-border-subtle
                       text-sm font-bold text-text-muted active:bg-bg-raised
                       flex items-center justify-center gap-2 touch-manipulation"
          >
            + Add Track
          </button>
        </div>
      )}
    </div>
  );
}

export function usePolyBadge(): string {
  const tracks = useMetronomeStore((s) => s.tracks);
  const num = useMetronomeStore((s) => s.meterNumerator);
  if (tracks.length <= 1) return `${num}`;
  return `${num}:${tracks.filter(t => t.id !== 'track-0').map(t => t.beats).join(':')}`;
}
