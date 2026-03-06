import { useState, useRef, useEffect } from 'react';
import { useMetronomeStore } from '../store/metronome-store';
import { useWakeLock } from '../hooks/useWakeLock';
import { Dial } from '../components/metronome/Dial';
import { PlayButton } from '../components/metronome/PlayButton';
import { BpmControl } from '../components/metronome/BpmControl';
import { TapTempo } from '../components/metronome/TapTempo';
import { RecordButton } from '../components/metronome/RecordButton';
import { NumberInput } from '../components/ui/NumberInput';
import { MeterControl } from '../components/metronome/MeterControl';
import { SubdivisionPicker } from '../components/metronome/SubdivisionPicker';
import { BeatGrid } from '../components/metronome/BeatGrid';
import { TrainerConfig } from '../components/metronome/TrainerConfig';
import { PracticeModes } from '../components/metronome/PracticeModes';
import { PolyrhythmControl } from '../components/metronome/PolyrhythmControl';

export function HomePage() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);

  const [showKeypad, setShowKeypad] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(200);

  useWakeLock();

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

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pb-4">
        {/* Header: project context */}
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-base">🥁</span>
          <span className="text-sm font-medium text-text-secondary truncate">
            My First Project
          </span>
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <span className="text-xs font-mono font-bold text-success">87%</span>
            <span className="text-[9px] text-text-muted">3🔥</span>
          </div>
        </div>

        {/* Dial */}
        <div
          ref={dialContainerRef}
          className="flex items-center justify-center pt-1"
        >
          <Dial size={dialSize} onTapBpm={() => setShowKeypad(true)} />
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2 pt-6">
          <BpmControl />
          <PlayButton />
          <div className="flex gap-2">
            <RecordButton />
            <TapTempo />
          </div>
        </div>

        {/* Meter + Subdivision row */}
        <div className="flex items-center gap-3 flex-wrap mt-4 mb-3">
          <MeterControl />
          <SubdivisionPicker />
        </div>

        {/* Pattern grid */}
        <div className="mb-3">
          <BeatGrid />
        </div>

        {/* Polyrhythm */}
        <div className="mb-3">
          <PolyrhythmControl />
        </div>

        {/* Trainer */}
        <div className="mb-3">
          <TrainerConfig />
        </div>

        {/* Practice modes */}
        <PracticeModes />

        {/* Bottom padding for settings handle */}
        <div className="h-[60px]" />
      </div>

      {/* BPM Keypad */}
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
