import { useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../../store/metronome-store';

interface DialProps {
  size: number;
  onTapBpm?: () => void;
}

const TRACK_COLORS = [
  { dot: 'rgba(255,255,255,', glow: 'rgba(255,255,255,' },
  { dot: 'rgba(45,212,191,', glow: 'rgba(45,212,191,' },
  { dot: 'rgba(251,191,36,', glow: 'rgba(251,191,36,' },
  { dot: 'rgba(251,113,133,', glow: 'rgba(251,113,133,' },
];

const RING_OFFSET = 16;

export function Dial({ size, onTapBpm }: DialProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  const bpm = useMetronomeStore((state) => state.bpm);
  const playing = useMetronomeStore((state) => state.playing);
  const meterNumerator = useMetronomeStore((state) => state.meterNumerator);
  const meterDenominator = useMetronomeStore((state) => state.meterDenominator);
  const subdivision = useMetronomeStore((state) => state.subdivision);
  const beatGrouping = useMetronomeStore((state) => state.beatGrouping);
  const tracks = useMetronomeStore((state) => state.tracks);
  const currentBeats = useMetronomeStore((state) => state.currentBeats);
  const currentBar = useMetronomeStore((state) => state.currentBar);

  const subdivisionLabels: Record<number, string> = {
    1: '',
    2: '8ths',
    3: 'Triplets',
    4: '16ths',
    5: 'Quints',
    6: 'Sextuplets',
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const devicePixelRatio = window.devicePixelRatio || 2;
    canvas.width = size * devicePixelRatio;
    canvas.height = size * devicePixelRatio;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, size, size);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = size / 2 - 18;

    // Neutral outer boundary. The previous hard-coded 87% green arc looked
    // like measured accuracy even when no session data existed.
    context.beginPath();
    context.arc(centerX, centerY, baseRadius + 7, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(255,255,255,0.10)';
    context.lineWidth = 3;
    context.stroke();

    const groupBoundaries = new Set<number>([0]);
    let groupedPosition = 0;
    for (let group = 0; group < beatGrouping.length - 1; group += 1) {
      groupedPosition += beatGrouping[group];
      groupBoundaries.add(groupedPosition);
    }

    for (let trackIndex = 0; trackIndex < tracks.length; trackIndex += 1) {
      const track = tracks[trackIndex];
      const isMain = trackIndex === 0;
      const radius = baseRadius - trackIndex * RING_OFFSET;
      const color = TRACK_COLORS[trackIndex] || TRACK_COLORS[0];
      const activeBeat = currentBeats[track.id] ?? -1;

      context.beginPath();
      context.arc(centerX, centerY, radius, 0, Math.PI * 2);
      context.strokeStyle = isMain ? 'rgba(255,255,255,0.10)' : `${color.dot}0.10)`;
      context.lineWidth = isMain ? 1.5 : 1;
      context.stroke();

      for (let beatIndex = 0; beatIndex < track.beats; beatIndex += 1) {
        const angle = (beatIndex / track.beats) * Math.PI * 2 - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const isDownbeat = beatIndex === 0;
        const isBeat = isMain ? beatIndex % subdivision === 0 : true;
        const mainBeatNumber = isMain ? Math.floor(beatIndex / subdivision) : beatIndex;
        const isGroupStart = isMain && groupBoundaries.has(mainBeatNumber) && isBeat;
        const isActive = playing && beatIndex === activeBeat;

        if ((isDownbeat || isGroupStart) && !isActive) {
          context.beginPath();
          context.arc(x, y, isMain ? (isDownbeat ? 10 : 8) : 8, 0, Math.PI * 2);
          context.fillStyle = `${color.dot}0.08)`;
          context.fill();
        }

        if (isActive) {
          context.beginPath();
          context.arc(x, y, isMain ? 12 : 10, 0, Math.PI * 2);
          context.fillStyle = `${color.glow}0.18)`;
          context.fill();

          context.beginPath();
          context.arc(x, y, isMain ? 8 : 7, 0, Math.PI * 2);
          context.fillStyle = `${color.glow}0.28)`;
          context.fill();
        }

        const dotRadius = isMain
          ? isDownbeat
            ? 5
            : isGroupStart
              ? 4.5
              : isBeat
                ? 3.5
                : 2
          : isDownbeat
            ? 4.5
            : 3;

        context.beginPath();
        context.arc(x, y, dotRadius, 0, Math.PI * 2);
        if (isActive) context.fillStyle = `${color.dot}0.95)`;
        else if (isDownbeat) context.fillStyle = `${color.dot}${isMain ? '0.65)' : '0.60)'}`;
        else if (isGroupStart) context.fillStyle = `${color.dot}0.50)`;
        else if (isBeat) context.fillStyle = `${color.dot}${isMain ? '0.35)' : '0.40)'}`;
        else context.fillStyle = `${color.dot}0.18)`;
        context.fill();
      }
    }

    if (playing && currentBar > 0) {
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `600 ${Math.round(size * 0.038)}px "JetBrains Mono", monospace`;
      context.fillStyle = 'rgba(255,255,255,0.72)';
      context.fillText(`Bar ${currentBar}`, centerX, centerY - size * 0.16);
    }

    const bpmFontSize = Math.round(size * 0.22);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${bpmFontSize}px "JetBrains Mono", monospace`;
    context.fillStyle = '#F1F1F4';
    const bpmText = bpm % 1 === 0 ? String(bpm) : bpm.toFixed(1);
    context.fillText(bpmText, centerX, centerY - size * 0.02);

    context.font = `700 ${Math.round(size * 0.042)}px "DM Sans", sans-serif`;
    context.fillStyle = '#A9A9B3';
    context.fillText('BPM', centerX, centerY + size * 0.09);

    const subdivisionLabel = subdivisionLabels[subdivision] || '';
    const meterText = `${meterNumerator}/${meterDenominator}${subdivisionLabel ? `  ·  ${subdivisionLabel}` : ''}`;
    context.font = `600 ${Math.round(size * 0.038)}px "JetBrains Mono", monospace`;
    context.fillStyle = 'rgba(255,255,255,0.68)';
    context.fillText(meterText, centerX, centerY + size * 0.15);

    if (tracks.length > 1) {
      const ratioText = tracks.map((track) => track.beats).join(':');
      context.font = `700 ${Math.round(size * 0.035)}px "JetBrains Mono", monospace`;
      context.fillStyle = 'rgba(255,255,255,0.72)';
      context.fillText(ratioText, centerX, centerY + size * 0.22);
    }
  }, [
    size,
    bpm,
    playing,
    meterNumerator,
    meterDenominator,
    subdivision,
    beatGrouping,
    tracks,
    currentBeats,
    currentBar,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    if (!playing) return;
    const animate = () => {
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [playing, draw]);

  const subdivisionLabel = subdivisionLabels[subdivision];
  const accessibleLabel = `${bpm % 1 === 0 ? bpm : bpm.toFixed(1)} BPM, ${meterNumerator}/${meterDenominator}${subdivisionLabel ? `, ${subdivisionLabel}` : ''}${onTapBpm ? '. Activate to enter tempo.' : ''}`;

  return (
    <canvas
      ref={canvasRef}
      onClick={onTapBpm}
      onKeyDown={(event) => {
        if (!onTapBpm) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onTapBpm();
        }
      }}
      role={onTapBpm ? 'button' : 'img'}
      tabIndex={onTapBpm ? 0 : -1}
      aria-label={accessibleLabel}
      className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      style={{
        width: size,
        height: size,
        display: 'block',
        cursor: onTapBpm ? 'pointer' : 'default',
      }}
    />
  );
}
