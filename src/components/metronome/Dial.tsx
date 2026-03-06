import { useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

interface DialProps {
  size: number;
  onTapBpm?: () => void;
}

/** Track ring colors — no purple/indigo */
const TRACK_COLORS = [
  { dot: 'rgba(255,255,255,', glow: 'rgba(255,255,255,' },           // Track 0: white
  { dot: 'rgba(45,212,191,',  glow: 'rgba(45,212,191,' },            // Track 1: teal
  { dot: 'rgba(251,191,36,',  glow: 'rgba(251,191,36,' },            // Track 2: amber
  { dot: 'rgba(251,113,133,', glow: 'rgba(251,113,133,' },           // Track 3: coral
];

/** Radius offset per track ring — staggered inward */
const RING_OFFSET = 16;

/**
 * Canvas-rendered dial with multi-ring polyrhythm support.
 *
 * Each track gets its own ring at a staggered radius with unique color.
 * - Track 0 (main): outermost, white dots
 * - Track 1: teal, R-16
 * - Track 2: amber, R-32
 * - Track 3: coral, R-48
 */
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

    // ─── Accuracy arc (outermost) ───
    const accuracy = 87;
    const sa = -Math.PI / 2;
    const ea = sa + (accuracy / 100) * Math.PI * 2;

    ctx.beginPath();
    ctx.arc(cx, cy, baseR + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, baseR + 7, sa, ea);
    ctx.strokeStyle = 'rgba(74,222,128,0.27)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Compute group boundary positions for track-0
    const groupBoundaries = new Set<number>([0]);
    {
      let pos = 0;
      for (let g = 0; g < beatGrouping.length - 1; g++) {
        pos += beatGrouping[g];
        groupBoundaries.add(pos);
      }
    }

    // ─── Draw each track ring ───
    for (let ti = 0; ti < tracks.length; ti++) {
      const track = tracks[ti];
      const isMain = ti === 0;
      const R = baseR - (ti * RING_OFFSET);
      const color = TRACK_COLORS[ti] || TRACK_COLORS[0];
      const totalBeats = track.beats;
      const activeBeat = currentBeats[track.id] ?? -1;

      // Ring circle (subtle)
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = isMain ? 'rgba(255,255,255,0.04)' : `${color.dot}0.03)`;
      ctx.lineWidth = isMain ? 1.5 : 1;
      ctx.stroke();

      // Beat dots
      for (let i = 0; i < totalBeats; i++) {
        const a = (i / totalBeats) * Math.PI * 2 - Math.PI / 2;
        const x = cx + R * Math.cos(a);
        const y = cy + R * Math.sin(a);

        const isDownbeat = i === 0;
        const isBeat = isMain ? (i % subdivision === 0) : true;
        const beatNum = isMain ? Math.floor(i / subdivision) : i;
        const isGroupStart = isMain && groupBoundaries.has(beatNum) && isBeat;
        const isActive = playing && i === activeBeat;

        // Downbeat/group-start halo
        if ((isDownbeat || isGroupStart) && !isActive) {
          ctx.beginPath();
          ctx.arc(x, y, isMain ? (isDownbeat ? 10 : 8) : 8, 0, Math.PI * 2);
          ctx.fillStyle = `${color.dot}0.04)`;
          ctx.fill();
        }

        // Active beat glow
        if (isActive) {
          ctx.beginPath();
          ctx.arc(x, y, isMain ? 12 : 10, 0, Math.PI * 2);
          ctx.fillStyle = `${color.glow}0.12)`;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, isMain ? 8 : 7, 0, Math.PI * 2);
          ctx.fillStyle = `${color.glow}0.2)`;
          ctx.fill();
        }

        // Dot
        let dotR: number;
        if (isMain) {
          dotR = isDownbeat ? 5 : isGroupStart ? 4.5 : isBeat ? 3.5 : 2;
        } else {
          dotR = isDownbeat ? 4.5 : 3;
        }

        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);

        if (isActive) {
          ctx.fillStyle = `${color.dot}0.9)`;
        } else if (isDownbeat) {
          ctx.fillStyle = `${color.dot}${isMain ? '0.5)' : '0.45)'}`;
        } else if (isGroupStart) {
          ctx.fillStyle = `${color.dot}0.35)`;
        } else if (isBeat) {
          ctx.fillStyle = `${color.dot}${isMain ? '0.18)' : '0.2)'}`;
        } else {
          ctx.fillStyle = `${color.dot}0.06)`;
        }
        ctx.fill();
      }
    }

    // ─── Center content (drawn on top of rings) ───

    // BPM number
    const bpmFontSize = Math.round(size * 0.22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${bpmFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#E8E8EC';
    const bpmText = bpm % 1 === 0 ? String(bpm) : bpm.toFixed(1);
    ctx.fillText(bpmText, cx, cy - size * 0.02);

    // "BPM" label
    ctx.font = `600 ${Math.round(size * 0.042)}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#2E2E34';
    ctx.fillText('BPM', cx, cy + size * 0.09);

    // Meter info
    const subLabel = subLabels[subdivision] || '';
    const meterText = `${meterNumerator}/${meterDenominator}${subLabel ? '  ·  ' + subLabel : ''}`;
    ctx.font = `500 ${Math.round(size * 0.038)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText(meterText, cx, cy + size * 0.15);

    // Polyrhythm ratio (if multiple tracks)
    if (tracks.length > 1) {
      const ratio = tracks.map((t, i) => {
        const c = TRACK_COLORS[i] || TRACK_COLORS[0];
        return { beats: t.beats, color: `${c.dot}0.5)` };
      });
      const ratioText = ratio.map(r => r.beats).join(':');
      ctx.font = `700 ${Math.round(size * 0.035)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText(ratioText, cx, cy + size * 0.22);
    }
  }, [size, bpm, playing, meterNumerator, meterDenominator, subdivision, beatGrouping, tracks, currentBeats]);

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
      onClick={onTapBpm}
      style={{ width: size, height: size, display: 'block', cursor: onTapBpm ? 'pointer' : 'default' }}
    />
  );
}
