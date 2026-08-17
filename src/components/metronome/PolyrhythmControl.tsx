import { useState } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { SOUND_CATALOG } from '../../audio/sounds';
import { audioEngine } from '../../audio';

const TRACK_COLORS = ['#15171A', '#0D9488', '#B45309', '#BE185D'];

function getSoundName(id: string) {
  return SOUND_CATALOG.find((sound) => sound.id === id)?.name || id;
}

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
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 px-2.5 rounded-lg
                   bg-bg-surface border border-border-subtle text-xs min-h-[40px]"
      >
        <span className="text-text-primary truncate">{getSoundName(currentSound)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`text-text-muted transition-transform shrink-0 ml-1 ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="mt-1 bg-bg-surface border border-border-subtle rounded-lg overflow-hidden max-h-[220px] overflow-y-auto shadow-sm">
          {SOUND_CATALOG.map((sound) => (
            <button
              type="button"
              key={sound.id}
              onClick={() => {
                onSelect(sound.id);
                audioEngine.previewSound(sound.id);
                setOpen(false);
              }}
              className={`w-full text-left px-2.5 py-2.5 text-xs flex items-center gap-1.5 min-h-[40px]
                ${sound.id === currentSound
                  ? 'text-text-primary bg-accent-dim font-semibold'
                  : 'text-text-secondary active:bg-bg-raised'
                }`}
            >
              {sound.id === currentSound && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span className={sound.id === currentSound ? '' : 'pl-[18px]'}>{sound.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

  const extraTracks = tracks.filter((track) => track.id !== 'track-0');

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Main track:</span>
          <span className="font-mono text-base text-text-primary font-bold">{meterNumerator} beats</span>
        </div>
        {extraTracks.length > 0 && (
          <span className="font-mono text-xs text-text-muted">
            {meterNumerator}:{extraTracks.map((track) => track.beats).join(':')}
          </span>
        )}
      </div>

      {extraTracks.map((track, index) => {
        const trackColor = TRACK_COLORS[index + 1] || TRACK_COLORS[1];
        const isExpanded = expandedTrack === track.id;

        return (
          <div key={track.id} className="mb-2 bg-bg-surface rounded-xl border border-border-subtle overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: trackColor }} />

              <button
                type="button"
                onClick={() => setExpandedTrack(isExpanded ? null : track.id)}
                className="flex-1 min-h-[40px] text-left flex items-center gap-2"
                aria-expanded={isExpanded}
              >
                <span className="text-sm text-text-secondary">Track {index + 2}</span>
                <span className="font-mono text-sm text-text-primary font-bold">{track.beats}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setTrackMuted(track.id, !track.muted)}
                className={`h-[40px] px-3 rounded-lg text-[10px] font-bold touch-manipulation border
                  ${track.muted
                    ? 'text-danger bg-danger-dim border-danger/20'
                    : 'text-text-primary bg-bg-raised border-border-subtle'}`}
              >
                {track.muted ? 'MUTED' : 'ON'}
              </button>
              <button
                type="button"
                onClick={() => removeTrack(track.id)}
                className="w-[40px] h-[40px] flex items-center justify-center rounded-lg
                           bg-bg-raised border border-border-subtle text-text-secondary
                           active:bg-danger-dim active:text-danger touch-manipulation"
                aria-label={`Remove track ${index + 2}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-border-subtle space-y-3 bg-bg-primary">
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
                    onChange={(event) => setTrackSwing(track.id, Number(event.target.value) / 100)}
                    className="w-full accent-accent h-2 bg-bg-raised rounded-full appearance-none
                               [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5
                               [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full
                               [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:cursor-pointer"
                  />
                </div>

                <div className="text-[10px] text-text-muted">
                  {getSoundName(track.normalSound)} · accent: {getSoundName(track.accentSound)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {tracks.length < 4 && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border-subtle">
          <div className="flex items-center bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setNewBeats(Math.max(2, newBeats - 1))}
              className="w-[44px] h-[44px] flex items-center justify-center text-text-primary active:bg-bg-raised text-lg font-bold"
            >−</button>
            <span className="w-[40px] text-center font-mono text-base text-text-primary font-bold">{newBeats}</span>
            <button
              type="button"
              onClick={() => setNewBeats(Math.min(16, newBeats + 1))}
              className="w-[44px] h-[44px] flex items-center justify-center text-text-primary active:bg-bg-raised text-lg font-bold"
            >+</button>
          </div>
          <button
            type="button"
            onClick={() => addTrack(newBeats)}
            className="flex-1 h-[44px] rounded-xl border-2 border-dashed border-border-emphasis
                       text-sm font-bold text-text-secondary active:bg-bg-raised
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
  const numerator = useMetronomeStore((s) => s.meterNumerator);
  if (tracks.length <= 1) return `${numerator}`;
  return `${numerator}:${tracks.filter((track) => track.id !== 'track-0').map((track) => track.beats).join(':')}`;
}
