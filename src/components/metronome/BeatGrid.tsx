import { useState, useRef, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';
import { VolumeState } from '../../audio/types';
import { SoundPickerSheet } from './SoundPickerSheet';

const FILL_MAP: Record<number, number> = {
  [VolumeState.OFF]: 0, [VolumeState.GHOST]: 15, [VolumeState.SOFT]: 35,
  [VolumeState.MED]: 55, [VolumeState.LOUD]: 78, [VolumeState.ACCENT]: 100,
};
const FILL_COLOR: Record<number, string> = {
  [VolumeState.OFF]: 'transparent', [VolumeState.GHOST]: 'rgba(255,255,255,0.03)',
  [VolumeState.SOFT]: 'rgba(255,255,255,0.06)', [VolumeState.MED]: 'rgba(255,255,255,0.10)',
  [VolumeState.LOUD]: 'rgba(255,255,255,0.18)', [VolumeState.ACCENT]: 'rgba(255,255,255,0.28)',
};
const TEXT_COLOR: Record<number, string> = {
  [VolumeState.OFF]: 'rgba(255,255,255,0.06)', [VolumeState.GHOST]: 'rgba(255,255,255,0.14)',
  [VolumeState.SOFT]: 'rgba(255,255,255,0.25)', [VolumeState.MED]: 'rgba(255,255,255,0.40)',
  [VolumeState.LOUD]: 'rgba(255,255,255,0.60)', [VolumeState.ACCENT]: 'rgba(255,255,255,0.90)',
};

const LONG_PRESS_MS = 600;

const VOL_LEVELS = [
  { state: VolumeState.OFF, label: 'Off' },
  { state: VolumeState.GHOST, label: 'Ghost' },
  { state: VolumeState.SOFT, label: 'Soft' },
  { state: VolumeState.MED, label: 'Med' },
  { state: VolumeState.LOUD, label: 'Loud' },
  { state: VolumeState.ACCENT, label: 'Accent' },
];

/** Quick control to set all subdivision cells to a volume level at once */
function SubVolumeControl({ track, subdivision }: { track: { accents: VolumeState[] }; subdivision: number }) {
  const setAllSubVol = useMetronomeStore((s) => s.setAllSubdivisionVolume);

  // Detect current sub volume (most common non-beat cell value)
  const subValues: VolumeState[] = [];
  for (let i = 0; i < track.accents.length; i++) {
    if (i % subdivision !== 0) subValues.push(track.accents[i]);
  }
  const currentVol = subValues.length > 0 ? subValues[0] : VolumeState.SOFT;
  const allSame = subValues.every(v => v === currentVol);

  return (
    <div className="flex items-center gap-1.5 mt-1.5 mb-0.5">
      <span className="text-[9px] text-text-muted uppercase tracking-wider shrink-0">Sub</span>
      <div className="flex gap-0.5 flex-1">
        {VOL_LEVELS.map(({ state, label }) => {
          const isActive = allSame && currentVol === state;
          const fillPct = FILL_MAP[state] ?? 0;
          const fillCol = FILL_COLOR[state] ?? 'transparent';
          return (
            <button
              key={state}
              onClick={() => setAllSubVol(state)}
              className={`
                flex-1 h-[28px] rounded-md text-[8px] font-bold
                touch-manipulation select-none relative overflow-hidden
                border transition-colors
                ${isActive
                  ? 'border-[rgba(255,255,255,0.15)] text-text-primary'
                  : 'border-border-subtle text-text-muted active:bg-bg-raised'
                }
              `}
            >
              <div
                className={`absolute bottom-0 left-0 right-0 ${fillPct === 100 ? 'rounded-md' : 'rounded-b-md'}`}
                style={{ height: `${fillPct}%`, backgroundColor: fillCol }}
              />
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Full accent pattern editor with long-press for per-beat sound assignment.
 * Tap: cycle volume state. Long-press: open sound picker.
 * Dot in corner indicates per-beat sound override.
 */
export function BeatGrid() {
  const tracks = useMetronomeStore((s) => s.tracks);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const playing = useMetronomeStore((s) => s.playing);
  const currentBeats = useMetronomeStore((s) => s.currentBeats);
  const updateTrackAccent = useMetronomeStore((s) => s.updateTrackAccent);
  const setBeatSound = useMetronomeStore((s) => s.setBeatSound);

  // Long-press state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{ trackId: string; beatIndex: number } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback((trackId: string, beatIndex: number) => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPickerTarget({ trackId, beatIndex });
      setPickerOpen(true);
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback((trackId: string, beatIndex: number) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    // Only tap-cycle if it wasn't a long press
    if (!didLongPress.current) {
      updateTrackAccent(trackId, beatIndex);
    }
  }, [updateTrackAccent]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // Get inherited sound for picker
  const pickerTrack = pickerTarget ? tracks.find(t => t.id === pickerTarget.trackId) : null;
  const pickerCurrentSound = pickerTrack && pickerTarget
    ? pickerTrack.soundOverrides[pickerTarget.beatIndex] ?? null
    : null;
  const pickerInheritedSound = pickerTrack
    ? pickerTrack.normalSound
    : 'woodblock';
  const pickerBeatLabel = pickerTarget
    ? `Beat ${Math.floor(pickerTarget.beatIndex / subdivision) + 1}`
    : '';

  return (
    <>
      <div className="space-y-2">
        {tracks.map((track, trackIdx) => {
          const isMainTrack = track.id === 'track-0';
          const totalCells = track.beats;

          const beatIndices: number[] = [];
          const hasSubRow = isMainTrack && subdivision > 1;

          if (hasSubRow) {
            for (let i = 0; i < totalCells; i++) {
              if (i % subdivision === 0) beatIndices.push(i);
            }
          } else {
            for (let i = 0; i < totalCells; i++) beatIndices.push(i);
          }

          return (
            <div key={track.id}>
              {!isMainTrack && (
                <div className="text-[9px] text-text-muted uppercase tracking-wider mb-0.5 flex items-center gap-1">
                  <span>Track {trackIdx + 1}</span>
                  <span className="font-mono">({track.beats})</span>
                </div>
              )}

              {/* Beat cells */}
              <div
                className="grid gap-0.5"
                style={{ gridTemplateColumns: `repeat(${beatIndices.length}, 1fr)` }}
              >
                {beatIndices.map((beatIdx) => {
                  const vol = track.accents[beatIdx] ?? VolumeState.SOFT;
                  const fillPct = FILL_MAP[vol] ?? 0;
                  const fillCol = FILL_COLOR[vol] ?? 'transparent';
                  const textCol = TEXT_COLOR[vol] ?? 'rgba(255,255,255,0.06)';
                  const beatNum = isMainTrack ? Math.floor(beatIdx / subdivision) + 1 : beatIdx + 1;
                  const isActive = playing && currentBeats[track.id] === beatIdx;
                  const hasOverride = track.soundOverrides[beatIdx] !== undefined;

                  return (
                    <button
                      key={beatIdx}
                      onPointerDown={(e) => { e.preventDefault(); handlePointerDown(track.id, beatIdx); }}
                      onPointerUp={() => handlePointerUp(track.id, beatIdx)}
                      onPointerLeave={handlePointerLeave}
                      onPointerCancel={handlePointerLeave}
                      className={`
                        h-[34px] rounded-md flex items-center justify-center
                        overflow-hidden touch-manipulation select-none relative border
                        ${isActive ? 'ring-1 ring-[rgba(255,255,255,0.3)]' : ''}
                        ${vol === VolumeState.OFF
                          ? 'border-[rgba(255,255,255,0.03)] bg-bg-primary'
                          : 'border-border-subtle bg-bg-surface'}
                      `}
                    >
                      <div
                        className={`absolute bottom-0 left-0 right-0 transition-all duration-100
                          ${fillPct === 100 ? 'rounded-md' : 'rounded-b-md'}`}
                        style={{ height: `${fillPct}%`, backgroundColor: fillCol }}
                      />
                      <span
                        className="relative z-10 font-mono text-[10px] font-bold"
                        style={{ color: textCol }}
                      >
                        {beatNum}
                      </span>
                      {/* Override indicator dot */}
                      {hasOverride && (
                        <div className="absolute top-1 right-1 w-[5px] h-[5px] rounded-full bg-[rgba(45,212,191,0.6)]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Sub Volume — quick control for all subdivision cells */}
              {hasSubRow && (
                <SubVolumeControl track={track} subdivision={subdivision} />
              )}

              {/* Subdivision cells */}
              {hasSubRow && (
                <div
                  className="grid gap-0.5 mt-0.5"
                  style={{ gridTemplateColumns: `repeat(${totalCells}, 1fr)` }}
                >
                  {Array.from({ length: totalCells }, (_, i) => {
                    const isBeat = i % subdivision === 0;
                    const vol = track.accents[i] ?? VolumeState.SOFT;
                    const fillPct = FILL_MAP[vol] ?? 0;
                    const fillCol = FILL_COLOR[vol] ?? 'transparent';
                    const isActive = playing && currentBeats[track.id] === i;
                    const hasOverride = track.soundOverrides[i] !== undefined;

                    return (
                      <button
                        key={i}
                        onPointerDown={(e) => { e.preventDefault(); handlePointerDown(track.id, i); }}
                        onPointerUp={() => handlePointerUp(track.id, i)}
                        onPointerLeave={handlePointerLeave}
                        onPointerCancel={handlePointerLeave}
                        className={`
                          h-[10px] rounded-sm overflow-hidden touch-manipulation select-none relative
                          ${isActive ? 'ring-1 ring-[rgba(255,255,255,0.2)]' : ''}
                          ${isBeat
                            ? 'bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)]'
                            : 'bg-bg-surface border border-border-subtle'}
                        `}
                      >
                        <div
                          className="absolute bottom-0 left-0 right-0 rounded-b-sm transition-all duration-100"
                          style={{ height: `${fillPct}%`, backgroundColor: fillCol }}
                        />
                        {hasOverride && (
                          <div className="absolute top-0.5 right-0.5 w-[3px] h-[3px] rounded-full bg-[rgba(45,212,191,0.6)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sound Picker Bottom Sheet */}
      <SoundPickerSheet
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentSoundId={pickerCurrentSound}
        inheritedSoundId={pickerInheritedSound}
        onSelect={(soundId) => {
          if (pickerTarget) {
            setBeatSound(pickerTarget.trackId, pickerTarget.beatIndex, soundId);
          }
        }}
        beatLabel={pickerBeatLabel}
      />
    </>
  );
}
