import { useState, useRef, useEffect } from 'react';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useWakeLock } from '../hooks/useWakeLock';
import { Dial } from '../components/metronome/Dial';
import { PlayButton } from '../components/metronome/PlayButton';
import { BpmControl } from '../components/metronome/BpmControl';
import { TapTempo } from '../components/metronome/TapTempo';
import { RecordButton } from '../components/metronome/RecordButton';
import { NumberInput } from '../components/ui/NumberInput';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import { MeterControl, useMeterBadge } from '../components/metronome/MeterControl';
import { SubdivisionPicker } from '../components/metronome/SubdivisionPicker';
import { GroupingPicker } from '../components/metronome/GroupingPicker';
import { BeatGrid } from '../components/metronome/BeatGrid';
import { TrainerConfig, useTrainerBadge } from '../components/metronome/TrainerConfig';
import { PracticeModes, usePracticeBadge } from '../components/metronome/PracticeModes';
import { PolyrhythmControl, usePolyBadge } from '../components/metronome/PolyrhythmControl';

export function HomePage() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const playing = useMetronomeStore((s) => s.playing);
  const playStartTime = useMetronomeStore((s) => s.playStartTime);
  const activeProject = useProjectStore((s) => s.getActiveProject)();

  const [showKeypad, setShowKeypad] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(200);

  // Session timer — ticks every second while playing
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!playing || !playStartTime) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - playStartTime) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [playing, playStartTime]);

  const meterBadge = useMeterBadge();
  const trainerBadge = useTrainerBadge();
  const practiceBadge = usePracticeBadge();
  const polyBadge = usePolyBadge();

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
        {/* Header: project context + session timer */}
        <div className="flex items-center gap-2 py-1.5">
          <span className="text-base">{activeProject?.icon || '🥁'}</span>
          <span className="text-sm font-medium text-text-secondary truncate">
            {activeProject?.name || 'Poly Pro'}
          </span>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {playing && elapsed > 0 ? (
              <span className="font-mono text-xs text-text-muted">
                {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            ) : activeProject ? (
              <span className="text-[11px] font-mono text-text-muted">
                {activeProject.currentBpm} / {activeProject.goalBpm}
              </span>
            ) : null}
          </div>
        </div>

        {/* Dial */}
        <div ref={dialContainerRef} className="flex items-center justify-center pt-1">
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

        {/* ─── Collapsible sections ─── */}
        <div className="mt-4 space-y-2">
          {/* Meter & Subdivision */}
          <CollapsibleCard title="Meter & Subdivision" badge={meterBadge} defaultOpen>
            <div className="space-y-4">
              <MeterControl />
              <SubdivisionPicker />
              <GroupingPicker />
            </div>
          </CollapsibleCard>

          {/* Pattern Grid */}
          <CollapsibleCard title="Pattern" defaultOpen>
            <BeatGrid />
          </CollapsibleCard>

          {/* Polyrhythm */}
          <CollapsibleCard title="Polyrhythm" badge={polyBadge}>
            <PolyrhythmControl />
          </CollapsibleCard>

          {/* Trainer */}
          <CollapsibleCard title="Trainer" badge={trainerBadge}>
            <TrainerConfig />
          </CollapsibleCard>

          {/* Practice Modes */}
          <CollapsibleCard title="Practice Modes" badge={practiceBadge}>
            <PracticeModes />
          </CollapsibleCard>
        </div>

        {/* Bottom padding */}
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
