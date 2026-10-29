import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio';
import { ensurePcmCaptureWorklet } from '../audio/worklets';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSettingsStore } from '../store/settings-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream, hasBtAudioOutput } from '../utils/mic';
import { beginCriticalActivity, isCriticalActivityActive } from '../utils/critical-activity';
import * as db from '../store/db';
import type { ScheduledBeat } from '../audio/types';
import { PREPARATION_DELAYS, TAKE_LENGTHS, type RecordingPreferences } from '../utils/recording-preferences';
import { OperationTimeoutError, withTimeout } from '../utils/async';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;
const WORKLET_FLUSH_TIMEOUT_MS = 2_000;
// AudioContext.resume() and addModule() can stay pending forever (no gesture, suspended device).
const AUDIO_STARTUP_TIMEOUT_MS = 10_000;

export type RecordingPhase = 'idle' | 'preparing' | 'countdown' | 'recording' | 'stopping' | 'saving' | 'error';

export interface RecordingState {
  phase: RecordingPhase;
  isRecording: boolean;
  elapsed: number;
  countdown: number;
  takeSeconds: number;
  micLevel: number;
  warning: string | null;
  btTip: string | null;
  isRawAudio: boolean;
  realtimeOnsetCount: number;
  error: string | null;
}

export interface RecordingResult {
  sessionId: string;
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
  durationMs: number;
  scheduledBeats: ScheduledBeat[];
  recordingStartTime: number;
  recordingEndTime: number;
}

function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    phase: 'idle',
    isRecording: false,
    elapsed: 0,
    countdown: 0,
    takeSeconds: 0,
    micLevel: 0,
    warning: null,
    btTip: null,
    isRawAudio: false,
    realtimeOnsetCount: 0,
    error: null,
  });

  const generationRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const setupAbortRef = useRef<AbortController | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const countdownTimerRef = useRef<ReturnType<typeof setInterval>>();
  const countdownResolveRef = useRef<((ready: boolean) => void) | null>(null);
  const isRecordingRef = useRef(false);
  const phaseRef = useRef<RecordingPhase>('idle');
  const recordingStartCtxTimeRef = useRef(0);
  const realtimeOnsetCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const chunkIndexRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const capturedBeatsRef = useRef<ScheduledBeat[]>([]);
  const stopOnFailureRef = useRef<(message: string) => void>(() => {});
  const writeErrorRef = useRef<unknown>(null);
  const donePromiseRef = useRef<Promise<void> | null>(null);
  const doneResolveRef = useRef<(() => void) | null>(null);
  const releaseCriticalRef = useRef<(() => void) | null>(null);
  const restoreOutputRef = useRef<(() => void) | null>(null);
  const metronomeWasRunningRef = useRef(false);
  const recordingConfigRef = useRef({ bpm: 120, meterNumerator: 4, meterDenominator: 4, subdivision: 1, countInBars: 0 });

  const onRealtimeOnsetRef = useRef<((time: number, peak: number) => void) | null>(null);
  const onAutoStopRef = useRef<((result: RecordingResult) => void) | null>(null);
  const finishAutomaticallyRef = useRef<() => void>(() => {});

  const setPhase = useCallback((phase: RecordingPhase) => {
    phaseRef.current = phase;
    setState((current) => ({ ...current, phase }));
    window.dispatchEvent(new CustomEvent('polypro:recording-phase', { detail: { phase } }));
  }, []);

  const releaseCritical = useCallback(() => {
    releaseCriticalRef.current?.();
    releaseCriticalRef.current = null;
    restoreOutputRef.current?.();
    restoreOutputRef.current = null;
  }, []);

  const cleanupRecording = useCallback(() => {
    setupAbortRef.current?.abort();
    setupAbortRef.current = null;
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = undefined;
    countdownResolveRef.current?.(false);
    countdownResolveRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      try { workletNodeRef.current.disconnect(); } catch {}
      workletNodeRef.current = null;
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch {}
      micSourceRef.current = null;
    }
    if (silentGainRef.current) {
      try { silentGainRef.current.disconnect(); } catch {}
      silentGainRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    generationRef.current++;
    if (isRecordingRef.current || ['recording', 'stopping', 'saving'].includes(phaseRef.current)) {
      audioEngine.stop(); useMetronomeStore.getState().setPlaying(false);
    }
    cleanupRecording();
    releaseCritical();
    window.dispatchEvent(new CustomEvent('polypro:recording-phase', { detail: { phase: 'idle' } }));
  }, [cleanupRecording, releaseCritical]);

  const cancelPreparation = useCallback(() => {
    if (!['preparing', 'countdown'].includes(phaseRef.current)) return;
    generationRef.current++;
    cleanupRecording();
    releaseCritical();
    setPhase('idle');
    setState((current) => ({ ...current, isRecording: false, countdown: 0, elapsed: 0, micLevel: 0, warning: null, btTip: null, error: null }));
  }, [cleanupRecording, releaseCritical, setPhase]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') cancelPreparation();
    };
    window.addEventListener('polypro:navigation', cancelPreparation);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('polypro:navigation', cancelPreparation);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [cancelPreparation]);

  const captureTiming = useCallback((): db.RecordingTiming => {
    const previous = capturedBeatsRef.current;
    const last = previous[previous.length - 1]?.time ?? recordingStartCtxTimeRef.current - 0.000001;
    const additions = audioEngine.scheduledBeats.filter((beat) => beat.trackId === 'track-0' && beat.time > last);
    const beats = [...previous, ...additions];
    capturedBeatsRef.current = beats;
    return { scheduledBeats: beats, recordingStartTime: recordingStartCtxTimeRef.current, recordingEndTime: audioEngine.getContext()?.currentTime ?? 0 };
  }, []);

  const startRecording = useCallback(async (preferences?: RecordingPreferences) => {
    if (isRecordingRef.current || !['idle', 'error'].includes(phaseRef.current)) return;

    if (isCriticalActivityActive()) {
      setState((current) => ({ ...current, error: 'Finish the current analysis, calibration or data operation before recording.' }));
      return;
    }
    const generation = ++generationRef.current;
    const setupAbort = new AbortController();
    setupAbortRef.current = setupAbort;
    const preparationSeconds = PREPARATION_DELAYS.find((value) => value === preferences?.preparationSeconds) ?? 0;
    const takeSeconds = TAKE_LENGTHS.find((value) => value === preferences?.takeSeconds) ?? 0;
    capturedBeatsRef.current = [];
    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;
    // Snapshot transport state before any microphone permission request can fail.
    // A denied mic must not stop a metronome the user already had running.
    metronomeWasRunningRef.current = audioEngine.running;
    releaseCriticalRef.current = beginCriticalActivity('recording');
    setPhase('preparing');
    setState((current) => ({ ...current, countdown: 0, takeSeconds, error: null, warning: 'Preparing microphone…' }));

    try {
      const micResult = await getPreferredMicStream(setupAbort.signal);
      if (generation !== generationRef.current) { micResult.stream.getTracks().forEach((track) => track.stop()); return; }
      micStreamRef.current = micResult.stream;
      const btDetected = await hasBtAudioOutput().catch(() => false);
      if (generation !== generationRef.current) return;
      const btTip = btDetected
        ? micResult.isBuiltIn
          ? `Mic: ${micResult.deviceLabel}`
          : `Using "${micResult.deviceLabel}" — Bluetooth may switch to call mode.`
        : null;

      const ctx = await withTimeout(audioEngine.initContext(), AUDIO_STARTUP_TIMEOUT_MS, 'Audio startup', { signal: setupAbort.signal });
      if (generation !== generationRef.current) return;
      await withTimeout(ensurePcmCaptureWorklet(ctx), AUDIO_STARTUP_TIMEOUT_MS, 'Recording engine load', { signal: setupAbort.signal });
      if (generation !== generationRef.current) return;

      if (preparationSeconds > 0) {
        setPhase('countdown');
        setState((current) => ({ ...current, countdown: preparationSeconds, warning: null, btTip }));
        const ready = await new Promise<boolean>((resolve) => {
          countdownResolveRef.current = resolve;
          const deadline = performance.now() + preparationSeconds * 1000;
          countdownTimerRef.current = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
            setState((current) => current.countdown === remaining ? current : { ...current, countdown: remaining });
            if (remaining === 0) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = undefined;
              countdownResolveRef.current = null;
              resolve(true);
            }
          }, 100);
        });
        if (!ready || generation !== generationRef.current) return;
        setPhase('preparing');
      }
      if (!micResult.stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        throw new Error('The microphone disconnected before recording began. Please try again.');
      }

      const metronome = useMetronomeStore.getState();
      // Starting the Trainer resets the transport to its configured first BPM.
      // Save that same tempo rather than the dial value from before Start.
      const startingBpm = !audioEngine.running && metronome.trainerEnabled ? metronome.trainerStartBpm : metronome.bpm;
      const activeProjectId = useProjectStore.getState().activeProjectId;
      recordingConfigRef.current = {
        bpm: startingBpm,
        meterNumerator: metronome.meterNumerator,
        meterDenominator: metronome.meterDenominator,
        subdivision: metronome.subdivision,
        countInBars: metronome.countInBars,
      };
      const silentRecording = !useSettingsStore.getState().includeClickInRecording;

      await db.beginChunkedRecording(sessionId, ctx.sampleRate, {
        projectId: activeProjectId,
        bpm: startingBpm,
        meterNumerator: metronome.meterNumerator,
        meterDenominator: metronome.meterDenominator,
        subdivision: metronome.subdivision,
      });
      if (generation !== generationRef.current) { await db.discardChunkedRecording(sessionId); return; }
      if (!micResult.stream.getAudioTracks().some((track) => track.readyState === 'live')) {
        throw new Error('The microphone disconnected before recording began. Please try again.');
      }
      chunkIndexRef.current = 0;
      writeChainRef.current = Promise.resolve();
      writeErrorRef.current = null;
      donePromiseRef.current = new Promise<void>((resolve) => { doneResolveRef.current = resolve; });

      const source = ctx.createMediaStreamSource(micResult.stream);
      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      micSourceRef.current = source;
      workletNodeRef.current = workletNode;
      silentGainRef.current = silentGain;
      source.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      realtimeOnsetCountRef.current = 0;
      workletNode.port.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'pcm') {
          const samples = message.samples instanceof Float32Array ? message.samples : new Float32Array(message.samples);
          const index = chunkIndexRef.current++;
          const timing = captureTiming();
          writeChainRef.current = writeChainRef.current.then(async () => {
            if (writeErrorRef.current) return;
            try {
              await db.appendRecordingChunk(sessionId, index, samples, timing);
            } catch (error) {
              writeErrorRef.current = error;
              stopOnFailureRef.current('Storage could not keep up with recording.');
            }
          });
        } else if (message.type === 'started') {
          recordingStartCtxTimeRef.current = message.time;
        } else if (message.type === 'done') {
          doneResolveRef.current?.();
          doneResolveRef.current = null;
          if (message.reason === 'limit') finishAutomaticallyRef.current();
        } else if (message.type === 'level') {
          setState((current) => ({ ...current, micLevel: message.peak }));
        } else if (message.type === 'onset') {
          realtimeOnsetCountRef.current++;
          setState((current) => ({ ...current, realtimeOnsetCount: realtimeOnsetCountRef.current }));
          onRealtimeOnsetRef.current?.(message.time, message.peak);
        }
      };

      workletNode.onprocessorerror = () => stopOnFailureRef.current('Audio capture was interrupted.');
      micResult.stream.getAudioTracks().forEach((track) => {
        track.onended = () => stopOnFailureRef.current('The microphone was disconnected.');
      });
      if (silentRecording) restoreOutputRef.current = audioEngine.suppressOutput();
      workletNode.port.postMessage({ type: 'start', maxSamples: Math.round((takeSeconds || MAX_RECORDING_MS / 1000) * ctx.sampleRate) });
      recordingStartCtxTimeRef.current = ctx.currentTime;
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      setPhase('recording');

      if (!audioEngine.running) {
        const started = audioEngine.startSync();
        if (!started) await audioEngine.start();
        if (generation !== generationRef.current || phaseRef.current !== 'recording') return;
        useMetronomeStore.getState().setPlaying(true);
      }

      setState({
        phase: 'recording',
        isRecording: true,
        elapsed: 0,
        countdown: 0,
        takeSeconds,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: micResult.isRaw,
        realtimeOnsetCount: 0,
        error: null,
      });

      timerRef.current = setInterval(() => {
        const elapsedMs = Math.max(0, (ctx.currentTime - recordingStartCtxTimeRef.current) * 1000);
        const elapsed = Math.floor(elapsedMs / 1000);
        const warning = elapsedMs > WARNING_MS ? 'Recording will auto-stop at 30:00' : null;
        if (elapsedMs > MAX_RECORDING_MS) {
          finishAutomaticallyRef.current();
          return;
        }
        setState((current) => current.elapsed === elapsed && current.warning === warning ? current : { ...current, elapsed, warning });
      }, 250);
    } catch (error) {
      if (generation !== generationRef.current) return;
      console.error('Failed to start recording:', error);
      isRecordingRef.current = false;
      cleanupRecording();
      if (!metronomeWasRunningRef.current && audioEngine.running) {
        audioEngine.stop();
        useMetronomeStore.getState().setPlaying(false);
      }
      db.discardChunkedRecording(sessionId).catch(() => {});
      releaseCritical();

      let message = error instanceof Error ? error.message : 'Recording failed. Please try again.';
      if (error instanceof OperationTimeoutError) message = 'Audio did not start in time. Tap Record to try again.';
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') message = 'Microphone access denied. Enable microphone permission and try again.';
        else if (error.name === 'NotFoundError') message = 'No microphone found.';
        else if (error.name === 'NotReadableError' || error.name === 'AbortError') message = 'Microphone is unavailable or in use by another app.';
      }
      setPhase('error');
      setState({ phase: 'error', isRecording: false, elapsed: 0, countdown: 0, takeSeconds: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false, realtimeOnsetCount: 0, error: message });
    }
  }, [cleanupRecording, releaseCritical, captureTiming, setPhase]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isRecordingRef.current || phaseRef.current !== 'recording') return null;
    generationRef.current++;
    isRecordingRef.current = false;
    setPhase('stopping');
    setState((current) => ({ ...current, isRecording: false }));
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;

    try {
      workletNodeRef.current?.port.postMessage({ type: 'stop' });
      if (donePromiseRef.current) {
        await Promise.race([
          donePromiseRef.current,
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Audio capture did not flush cleanly.')), WORKLET_FLUSH_TIMEOUT_MS)),
        ]);
      }
      // The final PCM message is queued before `done`. Release the microphone
      // and click as soon as capture is flushed, while durable writes finish.
      cleanupRecording();
      audioEngine.stop();
      useMetronomeStore.getState().setPlaying(false);
      setPhase('saving');
      await writeChainRef.current;
      if (writeErrorRef.current) throw writeErrorRef.current;

      const config = recordingConfigRef.current;
      const manifest = await db.finalizeChunkedRecording(sessionId);
      const durationMs = manifest.totalSamples / manifest.sampleRate * 1000;
      const { scheduledBeats, recordingStartTime, recordingEndTime } = manifest.timing ?? captureTiming();
      const session: db.SessionRecord = {
        id: sessionId,
        date: new Date(startTimeRef.current).toISOString(),
        projectId: manifest.projectId,
        bpm: config.bpm,
        meter: `${config.meterNumerator}/${config.meterDenominator}`,
        subdivision: config.subdivision,
        durationMs,
        totalHits: 0,
        avgDelta: 0,
        stdDev: 0,
        perfectPct: 0,
        hasRecording: true,
        analyzed: false,
        recordingSampleRate: manifest.sampleRate,
        recordingTiming: { scheduledBeats, recordingStartTime, recordingEndTime },
      };

      await useSessionStore.getState().addSession(session);
      if (manifest.projectId) {
        const project = useProjectStore.getState().projects.find((item) => item.id === manifest.projectId);
        if (project) {
          useProjectStore.getState().updateProject(manifest.projectId, {
            sessionIds: project.sessionIds.includes(sessionId) ? project.sessionIds : [...project.sessionIds, sessionId],
            lastOpened: new Date().toISOString(),
          }).catch(console.error);
        }
      }

      releaseCritical();
      setPhase('idle');
      setState({ phase: 'idle', isRecording: false, elapsed: 0, countdown: 0, takeSeconds: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false, realtimeOnsetCount: 0, error: null });

      return {
        sessionId,
        bpm: config.bpm,
        meterNumerator: config.meterNumerator,
        meterDenominator: config.meterDenominator,
        subdivision: config.subdivision,
        durationMs,
        scheduledBeats,
        recordingStartTime,
        recordingEndTime,
      };
    } catch (error) {
      console.error('Failed to stop/save recording:', error);
      cleanupRecording();
      audioEngine.stop();
      useMetronomeStore.getState().setPlaying(false);
      releaseCritical();
      await db.recoverOrphanedRecordings(0, sessionId).catch(() => {});
      await useSessionStore.getState().loadFromDB().catch(() => {});
      setPhase('error');
      setState((current) => ({
        ...current,
        phase: 'error',
        isRecording: false,
        warning: null,
        error: `Recording stopped, but saving did not complete: ${error instanceof Error ? error.message : 'unknown storage error'}. Saved chunks can be found in Progress; reopen the app if storage is temporarily unavailable.`,
      }));
      return null;
    }
  }, [cleanupRecording, releaseCritical, setPhase, captureTiming]);

  finishAutomaticallyRef.current = () => {
    void stopRecording().then((result) => { if (result) onAutoStopRef.current?.(result); });
  };

  stopOnFailureRef.current = (message) => {
    if (phaseRef.current !== 'recording') return;
    void stopRecording().then((result) => {
      setState((current) => ({ ...current, error: `${message} ${result ? 'The captured audio was saved in Progress.' : 'Check Progress for recovered audio.'}` }));
    });
  };

  const toggleRecording = useCallback(async (preferences?: RecordingPreferences): Promise<RecordingResult | null> => {
    if (phaseRef.current === 'recording') return stopRecording();
    if (phaseRef.current === 'preparing' || phaseRef.current === 'countdown') { cancelPreparation(); return null; }
    if (phaseRef.current === 'idle' || phaseRef.current === 'error') await startRecording(preferences);
    return null;
  }, [startRecording, stopRecording, cancelPreparation]);

  const setOnRealtimeOnset = useCallback((cb: ((time: number, peak: number) => void) | null) => {
    onRealtimeOnsetRef.current = cb;
  }, []);

  const setOnAutoStop = useCallback((cb: ((result: RecordingResult) => void) | null) => {
    onAutoStopRef.current = cb;
  }, []);

  const clearError = useCallback(() => {
    setPhase('idle');
    setState((current) => ({ ...current, phase: 'idle', error: null }));
  }, [setPhase]);

  return { ...state, startRecording, stopRecording, cancelPreparation, toggleRecording, setOnRealtimeOnset, setOnAutoStop, clearError };
}
