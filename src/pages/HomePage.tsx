import { useState, useRef, useEffect } from 'react';
import { useMetronomeStore } from '../store/metronome-store';
import { useWakeLock } from '../hooks/useWakeLock';
import { VolumeState } from '../audio/types';
import { Dial } from '../components/metronome/Dial';
import { PlayButton } from '../components/metronome/PlayButton';
import { BpmControl } from '../components/metronome/BpmControl';
import { TapTempo } from '../components/metronome/TapTempo';
import { NumberInput } from '../components/ui/NumberInput';

export function HomePage() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const meterNumerator = useMetronomeStore((s) => s.meterNumerator);
  const subdivision = useMetronomeStore((s) => s.subdivision);
  const tracks = useMetronomeStore((s) => s.tracks);
  const updateTrackAccent = useMetronomeStore((s) => s.updateTrackAccent);
  const playing = useMetronomeStore((s) => s.playing);
  const currentBeatIndex = useMetronomeStore((s) => s.currentBeatIndex);

  const [showKeypad, setShowKeypad] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(200);

  // Wake lock during playback
  useWakeLock();

  // Size dial — use 80% of width, max 360px
  useEffect(() => {
    const measure = () => {
      const el = dialContainerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const size = Math.round(w * 0.8);
      setDialSize(Math.max(160, Math.min(360, size)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Get the accent pattern for pattern row display
  const track = tracks[0];
  const beatCount = track ? meterNumerator : 4;
  const patternBeats = track
    ? Array.from({ length: beatCount }, (_, i) => ({
        index: i * subdivision,
        beatNum: i + 1,
        volumeState: track.accents[i * subdivision] ?? VolumeState.GHOST,
      }))
    : [];

  const volumeLabels: Record<number, string> = {
    [VolumeState.OFF]: 'OFF',
    [VolumeState.GHOST]: 'G',
    [VolumeState.MED]: 'M',
    [VolumeState.LOUD]: 'L',
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header: project context */}
      <div className="flex items-center gap-2 py-1.5 px-4 shrink-0">
        <span className="text-base">🥁</span>
        <span className="text-sm font-medium text-text-secondary truncate">
          My First Project
        </span>
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          <span className="text-xs font-mono font-bold text-success">87%</span>
          <span className="text-[9px] text-text-muted">3🔥</span>
        </div>
      </div>

      {/* Dial — sized to width, pushed toward top */}
      <div
        ref={dialContainerRef}
        className="shrink-0 flex items-center justify-center px-4 pt-1"
      >
        <Dial
          size={dialSize}
          onTapBpm={() => setShowKeypad(true)}
        />
      </div>

      {/* Controls — spaced below dial */}
      <div className="flex flex-col gap-2 px-4 pt-6 shrink-0">
        {/* ± hold-to-accelerate buttons */}
        <BpmControl />

        {/* START/STOP */}
        <PlayButton />

        {/* RECORD + TAP TEMPO */}
        <div className="flex gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl
                       border-[1.5px] border-border-subtle bg-bg-surface
                       text-text-secondary text-xs font-bold tracking-wide
                       active:bg-bg-raised transition-all h-[44px]
                       touch-manipulation select-none"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" className="text-danger" fill="currentColor">
              <circle cx="12" cy="12" r="10" />
            </svg>
            RECORD
          </button>
          <TapTempo />
        </div>
      </div>

      {/* Click visuals area — pattern row + scrollable space */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3">
        {/* Pattern row — beat accent cells (tap to cycle volume state) */}
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${beatCount}, 1fr)` }}
        >
          {patternBeats.map((b) => {
            const isActive = playing && Math.floor(currentBeatIndex / subdivision) === b.index / subdivision;
            return (
              <button
                key={b.index}
                onClick={() => {
                  if (track) updateTrackAccent(track.id, b.index);
                }}
                className={`
                  h-[34px] rounded-lg flex items-center justify-center
                  font-mono text-xs font-bold cursor-pointer transition-all
                  touch-manipulation select-none relative
                  ${isActive
                    ? 'ring-1 ring-[rgba(255,255,255,0.2)]'
                    : ''
                  }
                  ${b.volumeState === VolumeState.LOUD
                    ? 'bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.7)]'
                    : b.volumeState === VolumeState.MED
                      ? 'bg-bg-surface border border-border-subtle text-[rgba(255,255,255,0.35)]'
                      : b.volumeState === VolumeState.GHOST
                        ? 'bg-bg-surface border border-border-subtle text-text-muted'
                        : 'bg-bg-primary border border-[rgba(255,255,255,0.03)] text-[rgba(255,255,255,0.1)]'
                  }
                `}
              >
                <span className="text-[10px]">{b.beatNum}</span>
                {/* Volume state indicator */}
                <span className="absolute bottom-0.5 right-1 text-[7px] opacity-40">
                  {volumeLabels[b.volumeState]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Scrollable dead space */}
        <div className="h-[300px]" />
      </div>

      {/* Bottom spacing for settings handle */}
      <div className="h-1 shrink-0" />

      {/* BPM Keypad Modal */}
      <NumberInput
        isOpen={showKeypad}
        onClose={() => setShowKeypad(false)}
        onSubmit={setBpm}
        initialValue={bpm}
        min={20}
        max={300}
        step={0.5}
        label="BPM"
      />
    </div>
  );
}
