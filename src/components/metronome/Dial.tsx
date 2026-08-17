import { useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

interface DialProps {
  size: number;
  onTapBpm?: () => void;
}

/** Track ring colors for the light, high-contrast interface. */
const TRACK_COLORS = [
  { dot: 'rgba(21,23,26,', glow: 'rgba(21,23,26,' },
  { dot: 'rgba(13,148,136,', glow: 'rgba(13,148,136,' },
  { dot: 'rgba(180,83,9,', glow: 'rgba(180,83,9,' },
  { dot: 'rgba(190,24,93,', glow: 'rgba(190,24,93,' },
];

const RING_OFFSET = 16;

export function Dial({ size, onTapBpm }: DialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const bpm = useMetronomeStore((s) => s.bpm);
  const playing = useMetronomeStore((s) => s.playing);
  const meterNumerator = useMetronomeStore((s) => s.meterNumerator);
  const meterDenominator = useMetronomeStore((s) => s.meterDenominator);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const beatGrouping = useMetronomeStore((s) => s.beatGrouping);
  const tracks = useMetronomeStore((s) => s.tracks);
  const currentBeats = useMetronomeStore((s) => s.currentBeats);
  const currentBar = useMetronomeStore((s) => s.currentBar);

  const subLabels: Record<number, string> = {
    1: '', 2: '8ths', 3: 'Triplets', 4: '16ths', 5: 'Quints', 6: 'Sextuplets',
  };

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 2;
    c.width = size * dpr;
    c.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size / 2 - 18;

    // Neutral outer frame. Do not display a fabricated accuracy percentage
    // before a real analyzed session exists.
    ctx.beginPath();
    ctx.arc(cx, cy, baseR + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(21,23,26,0.08)';
    ctx.lineWidth = 3;
    ctx.stroke();

    const groupBoundaries = new Set<number>([0]);
    let groupPosition = 0;
    for (let g = 0; g < beatGrouping.length - 1; g++) {
      groupPosition += beatGrouping[g];
      groupBoundaries.add(groupPosition);
    }

    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti];
      const isMain = ti === 0;
      const radius = baseR - (ti * RING_OFFSET);
      const color = TRACK_COLORS[ti] || TRACK_COLORS[0];
      const totalBeats = track.beats;
      const activeBeat = currentBeats[track.id] ?? -1;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isMain ? 'rgba(21,23,26,0.09)' : `${color.dot}0.08)`;
      ctx.lineWidth = isMain ? 1.5 : 1;
      ctx.stroke();

      for (let i = 0; i < totalBeats; i++) {
        const angle = (i / totalBeats) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);

        const isDownbeat = i === 0;
        const isBeat = isMain ? (i % subdivision === 0) : true;
        const beatNum = isMain ? Math.floor(i / subdivision) : i;
        const isGroupStart = isMain && groupBoundaries.has(beatNum) && isBeat;
        const isActive = playing && i === activeBeat;

        if ((isDownbeat || isGroupStart) && !isActive) {
          ctx.beginPath();
          ctx.arc(x, y, isMain ? (isDownbeat ? 10 : 8) : 8, 0, Math.PI * 2);
          ctx.fillStyle = `${color.dot}0.07)`;
          ctx.fill();
        }

        if (isActive) {
          ctx.beginPath();
          ctx.arc(x, y, isMain ? 12 : 10, 0, Math.PI * 2);
          ctx.fillStyle = `${color.glow}0.13)`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, isMain ? 8 : 7, 0, Math.PI * 2);
          ctx.fillStyle = `${color.glow}0.20)`;
          ctx.fill();
        }

        let dotRadius: number;
        if (isMain) {
          dotRadius = isDownbeat ? 5 : isGroupStart ? 4.5 : isBeat ? 3.5 : 2;
        } else {
          dotRadius = isDownbeat ? 4.5 : 3;
        }

        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        if (isActive) {
          ctx.fillStyle = `${color.dot}0.95)`;
        } else if (isDownbeat) {
          ctx.fillStyle = `${color.dot}${isMain ? '0.72)' : '0.62)'}`;
        } else if (isGroupStart) {
          ctx.fillStyle = `${color.dot}0.58)`;
        } else if (isBeat) {
          ctx.fillStyle = `${color.dot}${isMain ? '0.40)' : '0.42)'}`;
        } else {
          ctx.fillStyle = `${color.dot}0.18)`;
        }
        ctx.fill();
      }
    }

    if (playing && currentBar > 0) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${Math.round(size * 0.038)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(21,23,26,0.52)';
      ctx.fillText(`Bar ${currentBar}`, cx, cy - size * 0.16);
    }

    const bpmFontSize = Math.round(size * 0.22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${bpmFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#15171A';
    const bpmText = bpm % 1 === 0 ? String(bpm) : bpm.toFixed(1);
    ctx.fillText(bpmText, cx, cy - size * 0.02);

    ctx.font = `700 ${Math.round(size * 0.042)}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#68707B';
    ctx.fillText('BPM', cx, cy + size * 0.09);

    const subLabel = subLabels[subdivision] || '';
    const meterText = `${meterNumerator}/${meterDenominator}${subLabel ? '  ·  ' + subLabel : ''}`;
    ctx.font = `600 ${Math.round(size * 0.038)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(21,23,26,0.48)';
    ctx.fillText(meterText, cx, cy + size * 0.15);

    if (tracks.length > 1) {
      const ratioText = tracks.map((track) => track.beats).join(':');
      ctx.font = `700 ${Math.round(size * 0.035)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(21,23,26,0.58)';
      ctx.fillText(ratioText, cx, cy + size * 0.22);
    }
  }, [size, bpm, playing, meterNumerator, meterDenominator, subdivision, beatGrouping, tracks, currentBeats, currentBar]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    if (!playing) return;
    const animate = () => {
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing, draw]);

  return (
    <canvas
      ref={canvasRef}
      role={onTapBpm ? 'button' : undefined}
      tabIndex={onTapBpm ? 0 : undefined}
      aria-label={onTapBpm ? `Tempo ${bpm} BPM. Open tempo keypad.` : undefined}
      onClick={onTapBpm}
      onKeyDown={(event) => {
        if (!onTapBpm) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTapBpm();
        }
      }}
      style={{ width: size, height: size, display: 'block', cursor: onTapBpm ? 'pointer' : 'default' }}
    />
  );
}
