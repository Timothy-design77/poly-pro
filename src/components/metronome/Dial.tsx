import { memo } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

interface DialProps {
  size: number;
  onTapBpm?: () => void;
}

const TRACK_COLORS = ['var(--text-primary)', '#0F766E', '#A45108', '#BE185D'];
const SUB_LABELS: Record<number, string> = { 1: '', 2: '8ths', 3: 'Triplets', 4: '16ths', 5: 'Quints', 6: 'Sextuplets' };

/** Beat changes drive the graphic; no continuous redraw or separate visual clock. */
export const Dial = memo(function Dial({ size, onTapBpm }: DialProps) {
  const bpm = useMetronomeStore((s) => s.bpm);
  const playing = useMetronomeStore((s) => s.playing);
  const numerator = useMetronomeStore((s) => s.meterNumerator);
  const denominator = useMetronomeStore((s) => s.meterDenominator);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const grouping = useMetronomeStore((s) => s.beatGrouping);
  const tracks = useMetronomeStore((s) => s.tracks);
  const currentBeats = useMetronomeStore((s) => s.currentBeats);
  const bar = useMetronomeStore((s) => s.currentBar);
  const boundaries = new Set([0]);
  let position = 0;
  for (const group of grouping.slice(0, -1)) { position += group; boundaries.add(position); }
  const center = size / 2;
  const tempo = bpm % 1 === 0 ? String(bpm) : bpm.toFixed(1);
  const dense = tracks.length > 2;
  const innerDiameter = size - 36 - (tracks.length - 1) * 36;
  const tempoSize = Math.round(Math.min(size * (tempo.length > 4 ? 0.20 : 0.25), innerDiameter * (tempo.length > 4 ? 0.28 : 0.36)));

  return (
    <div className="metronome-dial" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {tracks.map((track, ti) => {
          const radius = center - 18 - ti * 18;
          const main = ti === 0;
          const color = TRACK_COLORS[ti % TRACK_COLORS.length];
          return <g key={track.id} data-rhythm-track={track.id}>
            <circle cx={center} cy={center} r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth={main ? 1.5 : 1} />
            {Array.from({ length: track.beats }, (_, i) => {
              const angle = i / track.beats * Math.PI * 2 - Math.PI / 2;
              const x = center + radius * Math.cos(angle);
              const y = center + radius * Math.sin(angle);
              const beat = !main || i % subdivision === 0;
              const group = main && beat && boundaries.has(Math.floor(i / subdivision));
              const active = playing && currentBeats[track.id] === i;
              const r = active ? 6 : i === 0 ? 5 : group ? 4.5 : beat ? 3.5 : 2.25;
              return <g key={i} data-active={active ? 'true' : undefined}>
                {active && <circle cx={x} cy={y} r="11" fill="none" stroke={color} strokeWidth="1.5" />}
                <circle cx={x} cy={y} r={r} fill={active || i === 0 || group || !main ? color : 'var(--beat-marker)'} />
              </g>;
            })}
          </g>;
        })}
      </svg>
      <button type="button" className={`dial-center${dense ? ' dial-center-dense' : ''}`} onClick={onTapBpm} disabled={!onTapBpm}
        aria-label={`Tempo ${tempo} BPM. Open tempo keypad.`}>
        <span className="dial-bar" style={{ visibility: playing && bar > 0 ? 'visible' : 'hidden' }}>{`Bar ${bar}`}</span>
        <span className="dial-tempo" style={{ fontSize: tempoSize }}>{tempo}</span>
        <span className="dial-unit">BPM</span>
        <span className="dial-meter">{numerator}/{denominator}{SUB_LABELS[subdivision] ? ` · ${SUB_LABELS[subdivision]}` : ''}</span>
        {tracks.length > 1 && <span className="dial-ratio">{tracks.map((track) => track.beats).join(' : ')}</span>}
      </button>
    </div>
  );
});
