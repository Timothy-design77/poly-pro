import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react';
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
import { PageHeader } from '../components/ui/PageHeader';
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
import { useSettingsStore } from '../store/settings-store';
const SessionDetailPage = lazy(() => import('./SessionDetailPage').then((module) => ({ default: module.SessionDetailPage })));
import { useSessionStore } from '../store/session-store';
import type { SessionRecord } from '../store/db';
import { PREPARATION_DELAYS, TAKE_LENGTHS, readRecordingPreferences, saveRecordingPreferences, takeLengthLabel, type RecordingPreferences } from '../utils/recording-preferences';

export function HomePage() {
  const bpm = useMetronomeStore((s) => s.bpm);
  const setBpm = useMetronomeStore((s) => s.setBpm);
  const playing = useMetronomeStore((s) => s.playing);
  const playStartTime = useMetronomeStore((s) => s.playStartTime);
  const activeProject = useProjectStore((s) =>
    s.projects.find((project) => project.id === s.activeProjectId) || null
  );

  const [showKeypad, setShowKeypad] = useState(false);
  const openKeypad = useCallback(() => setShowKeypad(true), []);
  const dialContainerRef = useRef<HTMLDivElement>(null);
  const [dialSize, setDialSize] = useState(280);

  const recording = useRecording();
  const analysis = useAnalysis();
  const sessions = useSessionStore((s) => s.sessions);
  const loadSessions = useSessionStore((s) => s.loadFromDB);

  const [failedSessionId, setFailedSessionId] = useState<string | null>(null);
  const includeClick = useSettingsStore((state) => state.includeClickInRecording);
  const setIncludeClick = useSettingsStore((state) => state.setIncludeClickInRecording);
  const captureBusy = ['preparing', 'countdown', 'recording', 'stopping', 'saving'].includes(recording.phase);
  const setupLocked = captureBusy;
  const [recordingPreferences, setRecordingPreferences] = useState(readRecordingPreferences);
  const updateRecordingPreferences = (updates: Partial<RecordingPreferences>) => {
    const next = { ...recordingPreferences, ...updates };
    setRecordingPreferences(next);
    saveRecordingPreferences(next);
  };
  const [detailSession, setDetailSession] = useState<SessionRecord | null>(null);

  useEffect(() => { if (setupLocked) setShowKeypad(false); }, [setupLocked]);

  const processRecordingResult = useCallback(async (result: RecordingResult) => {
    setFailedSessionId(null);
    const analysisResult = await analysis.analyze(result.sessionId, {
      scheduledBeats: result.scheduledBeats,
      recordingStartTime: result.recordingStartTime,
      recordingEndTime: result.recordingEndTime,
    });
    if (analysisResult) {
      setDetailSession(useSessionStore.getState().sessions.find((session) => session.id === result.sessionId) ?? null);
    } else {
      setFailedSessionId(result.sessionId);
    }
  }, [analysis.analyze]);

  const handleRecordToggle = useCallback(async () => {
    const result = await recording.toggleRecording(recordingPreferences);
    if (result) await processRecordingResult(result);
  }, [recording.toggleRecording, recordingPreferences, processRecordingResult]);

  useEffect(() => {
    recording.setOnAutoStop(processRecordingResult);
    return () => recording.setOnAutoStop(null);
  }, [recording.setOnAutoStop, processRecordingResult]);

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
      const size = Math.round(el.clientWidth);
      setDialSize(Math.max(240, Math.min(340, size)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (dialContainerRef.current) observer.observe(dialContainerRef.current);
    return () => observer.disconnect();
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
      <div className="app-page app-page-wide">
        <PageHeader title="Practice"><div className="flex items-center gap-2 text-sm" aria-live="polite">
          {recording.phase === 'countdown' ? (
            <span className="text-sm font-semibold text-accent">Get ready · {recording.countdown}s</span>
          ) : recording.isRecording ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-danger animate-pulse shrink-0" />
              <span className="text-sm font-semibold text-danger">Recording</span>
              <span className="font-mono text-xs text-text-secondary">
                {Math.floor(recording.elapsed / 60)}:{String(recording.elapsed % 60).padStart(2, '0')}
                {recording.takeSeconds > 0 && ` / ${Math.floor(recording.takeSeconds / 60)}:${String(recording.takeSeconds % 60).padStart(2, '0')}`}
              </span>
              {recording.warning && <span className="text-xs text-warning">{recording.warning}</span>}
            </>
          ) : (
            <>
              {activeProject && <span className="text-sm text-text-secondary truncate max-w-[150px]">{activeProject.name}</span>}
              {playing && elapsed > 0 ? (
                <span className="font-mono text-xs text-text-muted">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
                </span>
              ) : activeProject ? (
                <span className="text-xs font-mono text-text-muted">
                  {activeProject.currentBpm} / {activeProject.goalBpm}
                </span>
              ) : null}
            </>
          )}
        </div></PageHeader>

        <div className="practice-layout">
        <section className="practice-instrument" aria-label="Metronome">
        <div
          ref={dialContainerRef}
          className="dial-container"
          role={setupLocked ? 'img' : undefined}
          aria-label={setupLocked ? `Tempo ${bpm} BPM` : undefined}
        >
          <Dial size={dialSize} onTapBpm={setupLocked ? undefined : openKeypad} />
        </div>

        <fieldset disabled={setupLocked} className="tempo-controls disabled:opacity-50">
          <BpmControl disabled={setupLocked}><TapTempo /></BpmControl>
        </fieldset>
        <div className="space-y-3">
          <div className="practice-transport grid grid-cols-2 gap-3">
            <PlayButton disabled={captureBusy} />
            <RecordButton phase={recording.phase} countdown={recording.countdown} disabled={analysis.isAnalyzing || ['stopping', 'saving'].includes(recording.phase)} isRecording={recording.isRecording} onToggle={handleRecordToggle} />

          </div>
          <details className="recording-setup text-sm">
            <summary className="min-h-[56px] cursor-pointer py-3 text-text-secondary">
              <span className="font-semibold">Recording setup</span>
              <span className="block text-xs text-text-muted mt-1">{includeClick ? 'Click' : 'Silent'} · {recordingPreferences.preparationSeconds ? `${recordingPreferences.preparationSeconds}s delay` : 'No delay'} · {recordingPreferences.takeSeconds ? takeLengthLabel(recordingPreferences.takeSeconds) : 'Manual stop'}</span>
            </summary>
          <fieldset disabled={captureBusy || analysis.isAnalyzing} className="p-3 pt-0 space-y-2 disabled:opacity-60">
            <legend className="text-xs font-semibold text-text-secondary mb-2">Click during recording</legend>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" aria-pressed={includeClick} aria-label="Record with click" onClick={() => setIncludeClick(true)} className={`min-h-[44px] rounded-xl border text-sm font-semibold ${includeClick ? 'bg-accent-dim text-accent border-accent' : 'bg-bg-surface text-text-secondary border-border-subtle'}`}>With click</button>
              <button type="button" aria-pressed={!includeClick} aria-label="Record without click" onClick={() => setIncludeClick(false)} className={`min-h-[44px] rounded-xl border text-sm font-semibold ${!includeClick ? 'bg-accent-dim text-accent border-accent' : 'bg-bg-surface text-text-secondary border-border-subtle'}`}>Silent</button>
            </div>
            <p className="text-xs text-text-muted">{includeClick ? 'Use headphones to keep clicks out of your recording.' : 'No audible click. Follow the visual beat; timing feedback stays available.'}</p>
          </fieldset>
            <fieldset disabled={captureBusy || analysis.isAnalyzing} className="p-3 pt-0 space-y-3 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-text-secondary">Preparation delay
                  <select aria-label="Preparation delay" value={recordingPreferences.preparationSeconds} onChange={(event) => updateRecordingPreferences({ preparationSeconds: Number(event.target.value) })} className="mt-1 w-full min-h-[44px] rounded-lg border border-border-subtle bg-bg-primary px-2 text-sm text-text-primary">
                    {PREPARATION_DELAYS.map((seconds) => <option key={seconds} value={seconds}>{seconds ? `${seconds} seconds` : 'None'}</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold text-text-secondary">Take length
                  <select aria-label="Take length" value={recordingPreferences.takeSeconds} onChange={(event) => updateRecordingPreferences({ takeSeconds: Number(event.target.value) })} className="mt-1 w-full min-h-[44px] rounded-lg border border-border-subtle bg-bg-primary px-2 text-sm text-text-primary">
                    {TAKE_LENGTHS.map((seconds) => <option key={seconds} value={seconds}>{seconds ? takeLengthLabel(seconds) : 'Stop manually'}</option>)}
                  </select>
                </label>
              </div>
              <p className="text-xs text-text-muted">Take length includes count-in. You can stop early.</p>
            </fieldset>
          </details>
          {recording.phase === 'countdown' && <p role="status" className="text-center text-xs text-text-secondary">Microphone ready. No audio is saved until the countdown ends.</p>}
        </div>

        <WaveformDisplay micLevel={recording.micLevel} isRecording={recording.isRecording} />

        {failedSessionId && <div role="alert" className="my-3 rounded-lg bg-warning-dim p-3 text-sm text-text-primary">
          <p>{analysis.error || 'Analysis cancelled.'} Your recording is saved.</p>
          <button className="min-h-[44px] underline font-semibold" onClick={() => setDetailSession(sessions.find((session) => session.id === failedSessionId) ?? null)}>Open saved take to retry</button>
        </div>}
        {recording.error && (
          <div role="alert" className="bg-danger-dim border border-danger/30 rounded-md p-3 mt-2 text-center">
            <p className="text-danger text-xs">{recording.error}</p>
            <button
              type="button"
              onClick={recording.clearError}
              className="text-danger text-xs font-semibold mt-2 min-h-[32px] px-3"
            >
              Dismiss
            </button>
          </div>
        )}

        {recording.btTip && (
          <div className="text-xs text-warning bg-warning-dim border border-warning/20 rounded-lg px-3 py-2 mt-2 text-center">
            {recording.btTip}
          </div>
        )}

        </section>
        <aside className="practice-settings" aria-label="Practice settings" hidden={captureBusy}>
          <h2 className="section-heading">Practice settings</h2>
          <fieldset disabled={setupLocked} ref={(element) => { if (element) element.inert = setupLocked; }} className="settings-list disabled:opacity-50">

            <CollapsibleCard
              title="Meter & subdivision"
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
              title="Practice modes"
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
          </fieldset>
        </aside>
        </div>
      </div>

      <NumberInput
        isOpen={showKeypad}
        onClose={() => setShowKeypad(false)}
        onSubmit={(value) => { if (!setupLocked) setBpm(value); }}
        initialValue={bpm}
        min={10}
        max={400}
        step={0.5}
        label="BPM"
      />

      <AnalyzingOverlay visible={analysis.isAnalyzing} progress={analysis.progress} />

      {detailSession && <Suspense fallback={<p role="status">Loading take…</p>}><SessionDetailPage
        session={detailSession}
        visible={detailSession !== null}
        onClose={() => setDetailSession(null)}
        onDelete={async () => {
          setDetailSession(null);
          await loadSessions();
        }}
      /></Suspense>}
    </div>
  );
}
