import { useState, useRef, useEffect, useCallback } from 'react';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { createDefaultTrack } from '../store/types';
import { DEFAULT_METER_DENOMINATOR, DEFAULT_METER_NUMERATOR, DEFAULT_SUBDIVISION } from '../utils/constants';
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

export function HomePage() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const playing = useMetronomeStore((s) => s.playing);
  const playStartTime = useMetronomeStore((s) => s.playStartTime);
  const activeProject = useProjectStore((s) =>
    s.projects.find((project) => project.id === s.activeProjectId) || null
  );

  const [showKeypad, setShowKeypad] = useState(false);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(240);

  const recording = useRecording();
  const analysis = useAnalysis();
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadFromDB);

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
    const current = sessions.find((session) => session.id === reviewSessionId) || null;
    const fresh = useSessionStore.getState().sessions.find((session) => session.id === reviewSessionId) || current;
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
      const el = dialContainerRef.current;
      if (!el) return;
      const size = Math.round(el.clientWidth * 0.74);
      setDialSize(Math.max(210, Math.min(340, size)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const resetMeterSection = useCallback(() => {
    const store = useMetronomeStore.getState();
    store.setMeter(DEFAULT_METER_NUMERATOR, DEFAULT_METER_DENOMINATOR);
    store.setSubdivision(DEFAULT_SUBDIVISION);
  }, []);

  const resetPatternSection = useCallback(() => {
    const state = useMetronomeStore.getState();
    const existingMain = state.tracks.find((track) => track.id === 'track-0');
    const defaultMain = createDefaultTrack(
      state.meterNumerator,
      state.subdivision,
      'track-0',
      state.beatGrouping,
    );
    const main = existingMain ? {
      ...defaultMain,
      normalSound: existingMain.normalSound,
      normalVolume: existingMain.normalVolume,
      accentSound: existingMain.accentSound,
      accentVolume: existingMain.accentVolume,
    } : defaultMain;
    useMetronomeStore.setState({
      tracks: [main, ...state.tracks.filter((track) => track.id !== 'track-0')],
    });
  }, []);

  const resetPolyrhythmSection = useCallback(() => {
    const state = useMetronomeStore.getState();
    const main = state.tracks.find((track) => track.id === 'track-0');
    if (main) useMetronomeStore.setState({ tracks: [{ ...main, muted: false, swing: 0 }] });
  }, []);

  const resetTrainerSection = useCallback(() => {
    const store = useMetronomeStore.getState();
    store.setTrainerEnabled(false);
    store.setTrainerConfig({
      trainerStartBpm: 80,
      trainerEndBpm: 140,
      trainerBpmStep: 5,
      trainerBarsPerStep: 4,
    });
  }, []);

  const resetPracticeSection = useCallback(() => {
    const store = useMetronomeStore.getState();
    store.setCountInBars(0);
    store.setSwing(0);
    store.setGapClick(false, 0.3);
    store.setRandomMute(false, 0.25);
    store.setPlayMuteCycle(false, 4, 4);
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-bg-primary">
      <BackupBanner />
      <div className="w-full max-w-xl mx-auto px-4 pb-8">
        <div className="min-h-[34px] flex items-center justify-center gap-2 py-1 text-center" aria-live="polite">
          {recording.isRecording ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0" />
              <span className="text-sm font-bold text-danger">RECORDING</span>
              <span className="font-mono text-xs text-text-secondary">
                {Math.floor(recording.elapsed / 60)}:{String(recording.elapsed % 60).padStart(2, '0')}
              </span>
              {recording.warning && <span className="text-[10px] text-warning">{recording.warning}</span>}
            </>
          ) : (
            <>
              <span className="text-base">{activeProject?.icon || '⚡'}</span>
              <span className="text-sm font-semibold text-text-primary truncate">
                {activeProject?.name || 'Quick Start'}
              </span>
              {playing && elapsed > 0 ? (
                <span className="font-mono text-xs text-text-muted">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
              ) : activeProject ? (
                <span className="text-[11px] font-mono text-text-muted">
                  {activeProject.currentBpm} / {activeProject.goalBpm}
                </span>
              ) : (
                <span className="text-[11px] text-text-muted">untracked</span>
              )}
            </>
          )}
        </div>

        {/* The BPM ring itself is the only keypad entry control on the primary surface. */}
        <div ref={dialContainerRef} className="flex items-center justify-center relative pb-2">
          <Dial size={dialSize} onTapBpm={() => setShowKeypad(true)} />
        </div>

        {/* Primary practice stack: large, full-width, low-cognitive-load controls. */}
        <div className="space-y-3">
          <RecordButton isRecording={recording.isRecording} onToggle={handleRecordToggle} />
          <PlayButton />
          <TapTempo />
        </div>

        <WaveformDisplay micLevel={recording.micLevel} isRecording={recording.isRecording} />

        {recording.error && (
          <div className="bg-danger-dim border border-danger/30 rounded-md p-3 mt-2 text-center">
            <p className="text-danger text-xs">{recording.error}</p>
            <button
              type="button"
              onClick={recording.clearError}
              className="text-danger text-[11px] font-semibold mt-2 min-h-[32px] px-3"
            >
              Dismiss
            </button>
          </div>
        )}

        {recording.btTip && (
          <div className="text-[11px] text-warning bg-warning-dim border border-warning/20 rounded-lg px-3 py-2 mt-2 text-center">
            {recording.btTip}
          </div>
        )}

        {/* Everything non-essential to immediate playing lives lower in the scroll. */}
        <div className="mt-10 pt-6 border-t border-border-subtle">
          <div className="mb-3 px-1">
            <h2 className="text-sm font-semibold text-text-primary">Advanced controls</h2>
            <p className="text-[11px] text-text-muted mt-0.5">
              Fine tempo adjustment, meter, patterns, practice modes, trainer, and polyrhythms
            </p>
          </div>

          <div className="space-y-2">
            <CollapsibleCard
              title="Fine Tempo"
              badge="±0.5"
              help="Use the large buttons for precise 0.5 BPM changes or hold them for accelerated changes."
            >
              <BpmControl />
            </CollapsibleCard>

            <CollapsibleCard
              title="Meter & Subdivision"
              badge={meterBadge}
              onReset={resetMeterSection}
              help="Set the time signature and subdivision. Reset returns this section to 4/4 with no subdivision."
            >
              <div className="space-y-4">
                <MeterControl />
                <SubdivisionPicker />
                <GroupingPicker />
              </div>
            </CollapsibleCard>

            <CollapsibleCard
              title="Pattern"
              onReset={resetPatternSection}
              help="Tap cells to set accent levels for each beat. Reset rebuilds the default accent pattern while keeping the selected main-track sounds."
            >
              <BeatGrid />
            </CollapsibleCard>

            <CollapsibleCard
              title="Practice Modes"
              badge={practiceBadge}
              onReset={resetPracticeSection}
              help="Count-in, swing, gap click, random mute, and play/mute cycles. Reset disables all practice modes and restores their default probabilities."
            >
              <PracticeModes />
            </CollapsibleCard>

            <CollapsibleCard
              title="Trainer"
              badge={trainerBadge}
              onReset={resetTrainerSection}
              help="Automatically increase BPM after a set number of bars. Reset disables Trainer and restores 80→140, +5 BPM every 4 bars."
            >
              <TrainerConfig />
            </CollapsibleCard>

            <CollapsibleCard
              title="Polyrhythm"
              badge={polyBadge}
              onReset={resetPolyrhythmSection}
              help="Add extra tracks with different beat counts. Reset removes extra tracks and restores the main track to an unmuted, straight state."
            >
              <PolyrhythmControl />
            </CollapsibleCard>
          </div>
        </div>

        <div className="h-6" />
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
          visible={true}
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
