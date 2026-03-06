import { useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

interface DialProps {
  size: number;
  onTapBpm?: () => void;
}

/**
 * Canvas-rendered dial with:
 * - Accuracy arc (outer green ring)
 * - Beat dots (3 sizes: downbeat 5px > beat 3.5px > subdivision 2px)
 * - Active beat highlight (orbiting glow)
 * - BPM number (tappable for keypad)
 * - "BPM" label
 * - Meter info (e.g. "4/4 · 8ths")
 */
export function Dial({ size, onTapBpm }: DialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const bpm = useMetronomeStore((s) => s.bpm);
  const playing = useMetronomeStore((s) => s.playing);
  const meterNumerator = useMetronomeStore((s) => s.meterNumerator);
  const meterDenominator = useMetronomeStore((s) => s.meterDenominator);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const tracks = useMetronomeStore((s) => s.tracks);
  const currentBeatIndex = useMetronomeStore((s) => s.currentBeatIndex);

  const subLabels: Record<number, string> = {
    1: '',
    2: '8ths',
    3: 'Triplets',
    4: '16ths',
    6: 'Sextuplets',
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
    const R = size / 2 - 18;

    const track = tracks[0];
    const totalBeats = track ? track.beats : meterNumerator * subdivision;

    // ─── Accuracy arc (outer ring) ───
    const accuracy = 87; // Placeholder until sessions exist
    const sa = -Math.PI / 2;
    const ea = sa + (accuracy / 100) * Math.PI * 2;

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Green arc
    ctx.beginPath();
    ctx.arc(cx, cy, R + 7, sa, ea);
    ctx.strokeStyle = 'rgba(74,222,128,0.27)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // ─── Main ring ───
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // ─── Beat dots ───
    for (let i = 0; i < totalBeats; i++) {
      const a = (i / totalBeats) * Math.PI * 2 - Math.PI / 2;
      const x = cx + R * Math.cos(a);
      const y = cy + R * Math.sin(a);

      const isDownbeat = i === 0;
      const isBeat = i % subdivision === 0;
      const isActive = playing && i === currentBeatIndex;

      // Downbeat halo
      if (isDownbeat && !isActive) {
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fill();
      }

      // Active beat glow
      if (isActive) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();
      }

      // Dot
      const dotR = isDownbeat ? 5 : isBeat ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, Math.PI * 2);

      if (isActive) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
      } else if (isDownbeat) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
      } else if (isBeat) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
      }
      ctx.fill();
    }

    // ─── BPM number ───
    const bpmFontSize = Math.round(size * 0.24);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${bpmFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = '#E8E8EC';

    // Show decimal only if not whole
    const bpmText = bpm % 1 === 0 ? String(bpm) : bpm.toFixed(1);
    ctx.fillText(bpmText, cx, cy - size * 0.02);

    // ─── "BPM" label ───
    ctx.font = `600 ${Math.round(size * 0.045)}px "DM Sans", sans-serif`;
    ctx.fillStyle = '#2E2E34';
    ctx.fillText('BPM', cx, cy + size * 0.1);

    // ─── Meter info ───
    const subLabel = subLabels[subdivision] || '';
    const meterText = `${meterNumerator}/${meterDenominator}${subLabel ? '  ·  ' + subLabel : ''}`;
    ctx.font = `500 ${Math.round(size * 0.04)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillText(meterText, cx, cy + size * 0.17);
  }, [size, bpm, playing, meterNumerator, meterDenominator, subdivision, tracks, currentBeatIndex]);

  // Redraw on state changes
  useEffect(() => {
    draw();
  }, [draw]);

  // Animation loop during playback for smooth updates
  useEffect(() => {
    if (!playing) return;

    const animate = () => {
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [playing, draw]);

  return (
    <canvas
      ref={canvasRef}
      onClick={onTapBpm}
      style={{
        width: size,
        height: size,
        display: 'block',
        cursor: onTapBpm ? 'pointer' : 'default',
      }}
    />
  );
}
