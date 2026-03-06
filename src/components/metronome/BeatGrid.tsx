import { useMetronomeStore } from '../../store/metronome-store';
import { VolumeState } from '../../audio/types';

// Fill height per volume state
const FILL_MAP: Record<number, number> = {
  [VolumeState.OFF]: 0,
  [VolumeState.GHOST]: 15,
  [VolumeState.SOFT]: 35,
  [VolumeState.MED]: 55,
  [VolumeState.LOUD]: 78,
  [VolumeState.ACCENT]: 100,
};

const FILL_COLOR: Record<number, string> = {
  [VolumeState.OFF]: 'transparent',
  [VolumeState.GHOST]: 'rgba(255,255,255,0.03)',
  [VolumeState.SOFT]: 'rgba(255,255,255,0.06)',
  [VolumeState.MED]: 'rgba(255,255,255,0.10)',
  [VolumeState.LOUD]: 'rgba(255,255,255,0.18)',
  [VolumeState.ACCENT]: 'rgba(255,255,255,0.28)',
};

const TEXT_COLOR: Record<number, string> = {
  [VolumeState.OFF]: 'rgba(255,255,255,0.06)',
  [VolumeState.GHOST]: 'rgba(255,255,255,0.14)',
  [VolumeState.SOFT]: 'rgba(255,255,255,0.25)',
  [VolumeState.MED]: 'rgba(255,255,255,0.40)',
  [VolumeState.LOUD]: 'rgba(255,255,255,0.60)',
  [VolumeState.ACCENT]: 'rgba(255,255,255,0.90)',
};

/**
 * Full accent pattern editor.
 * Shows beat cells for each track with grayscale fill bars.
 * Tap to cycle through 6 volume states.
 * Subdivision cells shown as smaller row beneath beats.
 */
export function BeatGrid() {
  const tracks = useMetronomeStore((s) => s.tracks);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const playing = useMetronomeStore((s) => s.playing);
  const currentBeats = useMetronomeStore((s) => s.currentBeats);
  const updateTrackAccent = useMetronomeStore((s) => s.updateTrackAccent);

  return (
    <div className="space-y-2">
      {tracks.map((track, trackIdx) => {
        const isMainTrack = track.id === 'track-0';
        const totalCells = track.beats;

        // For main track: separate beats and subdivisions
        // For poly tracks: no subdivision, just raw beats
        const beatIndices: number[] = [];
        const subIndices: number[] = [];

        if (isMainTrack && subdivision > 1) {
          for (let i = 0; i < totalCells; i++) {
            if (i % subdivision === 0) {
              beatIndices.push(i);
            } else {
              subIndices.push(i);
            }
          }
        } else {
          for (let i = 0; i < totalCells; i++) {
            beatIndices.push(i);
          }
        }

        return (
          <div key={track.id}>
            {/* Track label for poly tracks */}
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
                const beatNum = isMainTrack
                  ? Math.floor(beatIdx / subdivision) + 1
                  : beatIdx + 1;
                const isActive = playing && currentBeats[track.id] === beatIdx;

                return (
                  <button
                    key={beatIdx}
                    onClick={() => updateTrackAccent(track.id, beatIdx)}
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
                  </button>
                );
              })}
            </div>

            {/* Subdivision cells (smaller row) */}
            {isMainTrack && subdivision > 1 && subIndices.length > 0 && (
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

                  return (
                    <button
                      key={i}
                      onClick={() => updateTrackAccent(track.id, i)}
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
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
