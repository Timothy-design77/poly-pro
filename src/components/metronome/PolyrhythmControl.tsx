import { useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio/engine';

/** Track ring colors — same as Dial */
const TRACK_COLORS = ['white', '#2DD4BF', '#FBBF24', '#FB7185'];

function getSoundName(id: string) {
  return SOUND_CATALOG.find((s) => s.id === id)?.name || id;
}

/**
 * Per-track sound picker — compact dropdown.
 */
function TrackSoundPicker({
  label,
  currentSound,
  onSelect,
}: {
  label: string;
  currentSound: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <label className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 block">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg
                   bg-bg-primary border border-border-subtle text-xs"
      >
        <span className="text-text-primary truncate">{getSoundName(currentSound)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`text-text-muted transition-transform shrink-0 ml-1 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="mt-0.5 bg-bg-primary border border-border-subtle rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
          {SOUND_CATALOG.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                onSelect(s.id);
                audioEngine.previewSound(s.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-2 text-xs flex items-center gap-1.5
                ${s.id === currentSound
                  ? 'text-text-primary bg-bg-raised'
                  : 'text-text-secondary active:bg-bg-raised'
                }`}
            >
              {s.id === currentSound && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span className={s.id === currentSound ? '' : 'pl-[18px]'}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Polyrhythm track management with per-track sound and swing controls.
 */
export function PolyrhythmControl() {
  const tracks = useMetronomeStore((s) => s.tracks);
  const meterNumerator = useMetronomeStore((s) => s.meterNumerator);
  const addTrack = useMetronomeStore((s) => s.addTrack);
  const removeTrack = useMetronomeStore((s) => s.removeTrack);
  const setTrackMuted = useMetronomeStore((s) => s.setTrackMuted);
  const setTrackSound = useMetronomeStore((s) => s.setTrackSound);
  const setTrackSwing = useMetronomeStore((s) => s.setTrackSwing);
  const [newBeats, setNewBeats] = useState(3);
  const [expandedTrack, setExpandedTrack] = useState<string | null>(null);

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

      {/* Extra tracks — each with expandable settings */}
      {extraTracks.map((track, i) => {
        const trackColor = TRACK_COLORS[i + 1] || TRACK_COLORS[1];
        const isExpanded = expandedTrack === track.id;

        return (
          <div key={track.id} className="mb-2 bg-bg-surface rounded-xl border border-border-subtle overflow-hidden">
            {/* Track header row */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* Color indicator */}
              <div className="w-[8px] h-[8px] rounded-full shrink-0" style={{ backgroundColor: trackColor }} />

              {/* Expand toggle */}
              <button
                onClick={() => setExpandedTrack(isExpanded ? null : track.id)}
                className="flex-1 text-left flex items-center gap-2"
              >
                <span className="text-sm text-text-secondary">Track {i + 2}</span>
                <span className="font-mono text-sm text-text-primary font-bold">{track.beats}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Quick actions */}
              <button
                onClick={() => setTrackMuted(track.id, !track.muted)}
                className={`h-[34px] px-2.5 rounded-lg text-[10px] font-bold touch-manipulation
                  ${track.muted
                    ? 'text-danger bg-danger-dim border border-danger/20'
                    : 'text-text-secondary bg-bg-raised border border-border-subtle'}`}
              >
                {track.muted ? 'MUTED' : 'ON'}
              </button>
              <button
                onClick={() => removeTrack(track.id)}
                className="w-[34px] h-[34px] flex items-center justify-center rounded-lg
                           bg-bg-raised border border-border-subtle text-text-muted
                           active:bg-danger-dim touch-manipulation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Expanded settings */}
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-border-subtle space-y-3">
                {/* Sound pickers */}
                <div className="grid grid-cols-2 gap-2">
                  <TrackSoundPicker
                    label="Click Sound"
                    currentSound={track.normalSound}
                    onSelect={(id) => setTrackSound(track.id, id, false)}
                  />
                  <TrackSoundPicker
                    label="Accent Sound"
                    currentSound={track.accentSound}
                    onSelect={(id) => setTrackSound(track.id, id, true)}
                  />
                </div>

                {/* Swing */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[9px] text-text-muted uppercase tracking-wider">Swing</label>
                    <span className="font-mono text-[10px] text-text-muted">
                      {track.swing === 0 ? 'Straight' : `${Math.round(track.swing * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(track.swing * 100)}
                    onChange={(e) => setTrackSwing(track.id, Number(e.target.value) / 100)}
                    className="w-full accent-white h-1.5 bg-bg-raised rounded-full appearance-none
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4
                               [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                {/* Current sound summary */}
                <div className="text-[10px] text-text-muted">
                  {getSoundName(track.normalSound)} · accent: {getSoundName(track.accentSound)}
                </div>
              </div>
            )}
          </div>
        );
      })}

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
