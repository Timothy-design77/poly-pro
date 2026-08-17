import { useState, useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSettingsStore } from '../store/settings-store';
import { useWakeLock } from '../hooks/useWakeLock';
import { Dial } from '../components/metronome/Dial';
import { PlayButton } from '../components/metronome/PlayButton';
import { BpmControl } from '../components/metronome/BpmControl';
import { TapTempo } from '../components/metronome/TapTempo';
import { RecordButton } from '../components/metronome/RecordButton';
import { WaveformDisplay } from '../components/metronome/WaveformDisplay';
import { useRecording, type RecordingResult } from '../hooks/useRecording';
import { useAnalysis } from '../hooks/useAnalysis';
import { NumberInput } from '../components/ui/NumberInput';
import { CollapsibleCard } from '../components/ui/CollapsibleCard';
import { MeterControl, useMeterBadge } from '../components/metronome/MeterControl';
import { SubdivisionPicker } from '../components/metronome/SubdivisionPicker';
import { GroupingPicker } from '../components/metronome/GroupingPicker';
import { BeatGrid } from '../components/metronome/BeatGrid';
import { TrainerConfig, useTrainerBadge } from '../components/metronome/TrainerConfig';
import { PracticeModes, usePracticeBadge } from '../components/metronome/PracticeModes';
import { BackupBanner } from '../components/ui/BackupBanner';
import { PolyrhythmControl, usePolyBadge } from '../components/metronome/PolyrhythmControl';
import AnalyzingOverlay from '../components/session/AnalyzingOverlay';
import { ReviewScreen } from '../components/session/ReviewScreen';
import { SessionDetailPage } from './SessionDetailPage';
import { useSessionStore } from '../store/session-store';
import type { SessionAnalysis } from '../analysis/types';
import type { SessionRecord } from '../store/db';

const PREPARATION_STATUS = {
  microphone: 'Requesting microphone…',
  'bluetooth-check': 'Checking audio devices…',
  'audio-context': 'Starting audio engine…',
  'audio-worklet': 'Loading raw capture…',
  'audio-graph': 'Connecting microphone…',
  transport: 'Starting metronome…',
} as const;

export function HomePage() {
  const bpm = useMetronomeStore((state) => state.bpm);
  const setBpm = useMetronomeStore((state) => state.setBpm);
  const playing = useMetronomeStore((state) => state.playing);
  const playStartTime = useMetronomeStore((state) => state.playStartTime);
  const liveWaveform = useSettingsStore((state) => state.liveWaveform);
  const activeProject = useProjectStore((state) => (
    state.projects.find((project) => project.id === state.activeProjectId) || null
  ));

  const [showKeypad, setShowKeypad] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(200);

  const recording = useRecording();
  const analysis = useAnalysis();
  const sessions = useSessionStore((state) => state.sessions);
  const loadSessions = useSessionStore((state) => state.loadFromDB);

  const [reviewSessionId, setReviewSessionId] = useState<string | null>(null);
  const [reviewAnalysis, setReviewAnalysis] = useState<SessionAnalysis | null>(null);
  const [detailSession, setDetailSession] = useState<SessionRecord | null>(null);

  const processRecordingResult = useCallback(async (result: RecordingResult) => {
    const analysisResult = await analysis.analyze(result.sessionId, {
      bpm: result.bpm,
      meterNumerator: result.meterNumerator,
      meterDenominator: result.meterDenominator,
      subdivision: result.subdivision,
      durationMs: result.durationMs,
      scheduledBeats: result.scheduledBeats,
      recordingStartTime: result.recordingStartTime,
      recordingEndTime: result.recordingEndTime,
    });
    if (analysisResult) {
      setReviewSessionId(result.sessionId);
      setReviewAnalysis(analysisResult);
    } else {
      console.warn('Analysis produced no result');
    }
  }, [analysis.analyze]);

  const handleRecordToggle = useCallback(async () => {
    const result = await recording.toggleRecording();
    if (result) await processRecordingResult(result);
  }, [recording.toggleRecording, processRecordingResult]);

  useEffect(() => {
    recording.setOnAutoStop(processRecordingResult);
    return () => recording.setOnAutoStop(null);
  }, [recording.setOnAutoStop, processRecordingResult]);

  const handleReviewViewDetails = useCallback(async () => {
    if (!reviewSessionId) return;
    await loadSessions();
    const existing = sessions.find((session) => session.id === reviewSessionId) || null;
    const fresh = useSessionStore.getState().sessions.find(
      (session) => session.id === reviewSessionId,
    ) || existing;
    setReviewSessionId(null);
    setReviewAnalysis(null);
    setDetailSession(fresh);
  }, [reviewSessionId, sessions, loadSessions]);

  const handleReviewRecordAgain = useCallback(() => {
    setReviewSessionId(null);
    setReviewAnalysis(null);
  }, []);

  const handleReviewDelete = useCallback(async () => {
    await loadSessions();
    setReviewSessionId(null);
    setReviewAnalysis(null);
  }, [loadSessions]);

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
      const element = dialContainerRef.current;
      if (!element) return;
      const size = Math.round(element.clientWidth * 0.8);
      setDialSize(Math.max(160, Math.min(360, size)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const isRecordingBusy = recording.phase === 'preparing'
    || recording.phase === 'stopping'
    || recording.phase === 'saving';
  const busyLabel = recording.phase === 'preparing'
    ? PREPARATION_STATUS[recording.preparationStage ?? 'microphone']
    : recording.phase === 'stopping'
      ? 'Finishing recording…'
      : recording.phase === 'saving'
        ? 'Saving session…'
        : null;

  return (
    <div className="h-full overflow-y-auto">
      <BackupBanner />
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2 py-1.5" aria-live="polite">
          {recording.isRecording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" aria-hidden="true" />
              <span className="text-sm font-bold text-danger">REC</span>
              <span className="font-mono text-xs text-text-secondary ml-1">
                {Math.floor(recording.elapsed / 60)}:{String(recording.elapsed % 60).padStart(2, '0')}
              </span>
              {recording.warning && (
                <span className="text-[9px] text-warning ml-auto">{recording.warning}</span>
              )}
            </>
          ) : isRecordingBusy ? (
            <>
              <span className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0" aria-hidden="true" />
              <span className="text-xs font-semibold text-warning">{busyLabel}</span>
            </>
          ) : (
            <>
              <span className="text-base" aria-hidden="true">{activeProject?.icon || '🥁'}</span>
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
            </>
          )}
        </div>

        <div ref={dialContainerRef} className="flex items-center justify-center pt-1 relative">
          <Dial size={dialSize} onTapBpm={() => setShowKeypad(true)} />
        </div>

        <div className="flex flex-col gap-2 pt-6">
          <BpmControl />
          <PlayButton />
          <div className="flex gap-2 items-center">
            <RecordButton
              phase={recording.phase}
              preparationStage={recording.preparationStage}
              onToggle={handleRecordToggle}
            />
            <TapTempo />
          </div>

          {liveWaveform && (
            <WaveformDisplay micLevel={recording.micLevel} isRecording={recording.isRecording} />
          )}

          {recording.error && (
            <div
              className="bg-danger-dim border border-danger/30 rounded-md p-2 mt-1"
              role="alert"
            >
              <p className="text-danger text-xs">{recording.error}</p>
              <button
                type="button"
                onClick={recording.clearError}
                className="text-danger text-xs underline underline-offset-2 mt-2 min-h-[36px] px-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {recording.btTip && (
            <div className="text-[11px] text-warning bg-warning/10 rounded-lg px-3 py-2 mt-2">
              {recording.btTip}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <CollapsibleCard
            title="Meter & Subdivision"
            badge={meterBadge}
            defaultOpen
            help="Set the time signature and subdivision. The metronome subdivides each beat into smaller pulses (8ths, triplets, 16ths)."
          >
            <div className="space-y-4">
              <MeterControl />
              <SubdivisionPicker />
              <GroupingPicker />
            </div>
          </CollapsibleCard>

          <CollapsibleCard
            title="Pattern"
            defaultOpen
            help="Tap cells to set accent levels for each beat. Six levels are available. Long-press a cell to change its sound."
          >
            <BeatGrid />
          </CollapsibleCard>

          <CollapsibleCard
            title="Polyrhythm"
            badge={polyBadge}
            help="Add extra tracks with different beat counts to create polyrhythmic patterns. Each track plays evenly across the measure."
          >
            <PolyrhythmControl />
          </CollapsibleCard>

          <CollapsibleCard
            title="Trainer"
            badge={trainerBadge}
            help="Automatically increase BPM after a set number of bars. Set start BPM, end BPM, step size, and bars per step."
          >
            <TrainerConfig />
          </CollapsibleCard>

          <CollapsibleCard
            title="Practice Modes"
            badge={practiceBadge}
            help="Count-in plays click-only bars before starting. Gap click randomly mutes beats. Random mute silences measures."
          >
            <PracticeModes />
          </CollapsibleCard>
        </div>

        <div className="h-[60px]" />
      </div>

      <NumberInput
        isOpen={showKeypad}
        onClose={() => setShowKeypad(false)}
        onSubmit={setBpm}
        onLiveChange={setBpm}
        initialValue={bpm}
        min={10}
        max={400}
        step={0.5}
        label="BPM"
      />

      <AnalyzingOverlay visible={analysis.isAnalyzing} progress={analysis.progress} />

      {reviewSessionId && reviewAnalysis && (
        <ReviewScreen
          visible
          sessionId={reviewSessionId}
          analysis={reviewAnalysis}
          onViewDetails={handleReviewViewDetails}
          onRecordAgain={handleReviewRecordAgain}
          onDelete={handleReviewDelete}
        />
      )}

      <SessionDetailPage
        session={detailSession}
        visible={detailSession !== null}
        onClose={() => setDetailSession(null)}
        onDelete={async () => {
          setDetailSession(null);
          await loadSessions();
        }}
      />
    </div>
  );
}
