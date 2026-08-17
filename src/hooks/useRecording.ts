import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { useSettingsStore } from '../store/settings-store';
import { getPreferredMicStream, hasBtAudioOutput } from '../utils/mic';
import {
  OperationCancelledError,
  OperationTimeoutError,
  delay,
  withTimeout,
} from '../utils/async';
import { acquireCriticalActivity } from '../utils/appActivity';
import * as db from '../store/db';
import type { ScheduledBeat } from '../audio/types';
import { createRecordingSink, type RecordingSink } from '../platform/recordingSink';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;
const AUDIO_CONTEXT_TIMEOUT_MS = 10_000;
const WORKLET_TIMEOUT_MS = 12_000;
const TRANSPORT_TIMEOUT_MS = 10_000;
const FINAL_FLUSH_MS = 180;

export type RecordingPhase =
  | 'idle'
  | 'preparing'
  | 'recording'
  | 'stopping'
  | 'saving'
  | 'error';

export type RecordingPreparationStage =
  | 'microphone'
  | 'bluetooth-check'
  | 'audio-context'
  | 'audio-worklet'
  | 'storage'
  | 'audio-graph'
  | 'transport';

export interface RecordingState {
  phase: RecordingPhase;
  preparationStage: RecordingPreparationStage | null;
  isRecording: boolean;
  elapsed: number;
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

const IDLE_STATE: RecordingState = {
  phase: 'idle',
  preparationStage: null,
  isRecording: false,
  elapsed: 0,
  micLevel: 0,
  warning: null,
  btTip: null,
  isRawAudio: false,
  realtimeOnsetCount: 0,
  error: null,
};

function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function formatRecordingError(error: unknown): string {
  if (error instanceof OperationTimeoutError) {
    if (error.operation.includes('AudioWorklet')) {
      return 'The browser could not initialize raw audio capture. Reload the app, close other audio tabs, and try again.';
    }
    if (error.operation.includes('microphone')) {
      return 'Microphone setup timed out. Close other audio apps, verify browser microphone permission, and try again.';
    }
    if (error.operation.includes('AudioContext') || error.operation.includes('metronome')) {
      return 'The audio engine did not become ready. Tap once on the page, then try recording again.';
    }
    return `${error.operation} timed out. No recording was started.`;
  }

  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'Microphone access denied. Enable microphone permission in your browser settings and try again.';
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return 'No microphone was found. Connect or enable a microphone and try again.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The microphone is unavailable or in use by another app. Close other audio apps and try again.';
    }
    if (error.name === 'NotSupportedError') {
      return 'This browser does not support the raw recording features required by Poly Pro.';
    }
    if (error.name === 'SecurityError') {
      return 'Microphone recording requires a secure HTTPS connection.';
    }
  }

  return 'Recording failed before capture began. Resources were cleaned up; try again.';
}

/**
 * Raw PCM recording lifecycle.
 *
 * Preparation, active capture, stopping, and persistence are explicit phases.
 * Every browser operation that can remain pending is time-bounded, and every
 * failure path releases streams, nodes, timers, transport, and activity locks.
 */
export function useRecording() {
  const [state, setState] = useState<RecordingState>(IDLE_STATE);

  const phaseRef = useRef<RecordingPhase>('idle');
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const recordingSinkRef = useRef<RecordingSink | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startupAbortRef = useRef<AbortController | null>(null);
  const releaseActivityRef = useRef<(() => void) | null>(null);
  const stopPromiseRef = useRef<Promise<RecordingResult | null> | null>(null);
  const stopRecordingRef = useRef<(() => Promise<RecordingResult | null>) | null>(null);
  const transportStartedByRecordingRef = useRef(false);

  const recordingStartCtxTimeRef = useRef(0);
  const realtimeOnsetCountRef = useRef(0);
  const onRealtimeOnsetRef = useRef<((time: number, peak: number) => void) | null>(null);
  const onAutoStopRef = useRef<((result: RecordingResult) => void) | null>(null);

  const releaseActivity = useCallback(() => {
    releaseActivityRef.current?.();
    releaseActivityRef.current = null;
  }, []);

  const discardRecordingSink = useCallback(async () => {
    const sink = recordingSinkRef.current;
    recordingSinkRef.current = null;
    if (!sink) return;
    try {
      await sink.discard();
    } catch (error) {
      console.warn('[recording] Could not discard staged audio:', error);
    }
  }, []);

  const cleanupCaptureResources = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const worklet = workletNodeRef.current;
    if (worklet) {
      worklet.port.onmessage = null;
      try { worklet.disconnect(); } catch {}
      workletNodeRef.current = null;
    }

    const source = micSourceRef.current;
    if (source) {
      try { source.disconnect(); } catch {}
      micSourceRef.current = null;
    }

    const micGain = micGainRef.current;
    if (micGain) {
      try { micGain.disconnect(); } catch {}
      micGainRef.current = null;
    }

    const silentGain = silentGainRef.current;
    if (silentGain) {
      try { silentGain.disconnect(); } catch {}
      silentGainRef.current = null;
    }

    stopMediaStream(micStreamRef.current);
    micStreamRef.current = null;
    audioEngine.setOutputVolumeOverride(null);
  }, []);

  const stopTransportIfOwned = useCallback(() => {
    if (!transportStartedByRecordingRef.current) return;
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);
    transportStartedByRecordingRef.current = false;
  }, []);

  const resetToIdle = useCallback(() => {
    phaseRef.current = 'idle';
    setState(IDLE_STATE);
  }, []);

  const cancelPreparation = useCallback(() => {
    if (phaseRef.current !== 'preparing') return;
    startupAbortRef.current?.abort();
    startupAbortRef.current = null;
    cleanupCaptureResources();
    void discardRecordingSink();
    stopTransportIfOwned();
    releaseActivity();
    resetToIdle();
  }, [cleanupCaptureResources, discardRecordingSink, releaseActivity, resetToIdle, stopTransportIfOwned]);

  useEffect(() => () => {
    startupAbortRef.current?.abort();
    cleanupCaptureResources();
    void discardRecordingSink();
    stopTransportIfOwned();
    releaseActivity();
  }, [cleanupCaptureResources, discardRecordingSink, releaseActivity, stopTransportIfOwned]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'error') return false;

    const abortController = new AbortController();
    startupAbortRef.current = abortController;
    releaseActivityRef.current = acquireCriticalActivity('recording');
    phaseRef.current = 'preparing';
    setState({
      ...IDLE_STATE,
      phase: 'preparing',
      preparationStage: 'microphone',
    });

    try {
      const micResult = await getPreferredMicStream(abortController.signal);
      micStreamRef.current = micResult.stream;

      setState((current) => ({
        ...current,
        preparationStage: 'bluetooth-check',
        isRawAudio: micResult.isRaw,
      }));
      const btDetected = await hasBtAudioOutput(abortController.signal);
      const btTip = btDetected
        ? micResult.isBuiltIn
          ? `Mic: ${micResult.deviceLabel}`
          : `Using "${micResult.deviceLabel}" — Bluetooth may switch to call mode.`
        : null;

      setState((current) => ({ ...current, preparationStage: 'audio-context', btTip }));
      const context = await withTimeout(
        audioEngine.initContext(),
        AUDIO_CONTEXT_TIMEOUT_MS,
        'AudioContext initialization',
        { signal: abortController.signal },
      );

      if (context.state === 'suspended') {
        await withTimeout(
          context.resume(),
          AUDIO_CONTEXT_TIMEOUT_MS,
          'AudioContext resume',
          { signal: abortController.signal },
        );
      }

      if (!context.audioWorklet) {
        throw new DOMException('AudioWorklet is unavailable', 'NotSupportedError');
      }

      setState((current) => ({ ...current, preparationStage: 'audio-worklet' }));
      const basePath = import.meta.env.BASE_URL || '/poly-pro/';
      await withTimeout(
        context.audioWorklet.addModule(`${basePath}worklets/pcm-capture.js`),
        WORKLET_TIMEOUT_MS,
        'AudioWorklet module loading',
        { signal: abortController.signal },
      );

      setState((current) => ({ ...current, preparationStage: 'storage' }));
      recordingSinkRef.current = await createRecordingSink();

      setState((current) => ({ ...current, preparationStage: 'audio-graph' }));
      const source = context.createMediaStreamSource(micResult.stream);
      micSourceRef.current = source;

      const recordingSettings = useSettingsStore.getState();
      const micGain = context.createGain();
      micGain.gain.value = 1 + recordingSettings.sensitivity * 4;
      micGainRef.current = micGain;

      const workletNode = new AudioWorkletNode(context, 'pcm-capture-processor');
      workletNodeRef.current = workletNode;

      const silentGain = context.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(micGain);
      micGain.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(context.destination);

      realtimeOnsetCountRef.current = 0;
      workletNode.port.onmessage = (event) => {
        const message = event.data;
        if (message.type === 'pcm') {
          const samples = message.samples instanceof Float32Array
            ? message.samples
            : new Float32Array(message.samples);
          recordingSinkRef.current?.append(samples);
          return;
        }
        if (message.type === 'level') {
          setState((current) => ({ ...current, micLevel: message.peak }));
          return;
        }
        if (message.type === 'onset') {
          realtimeOnsetCountRef.current += 1;
          setState((current) => ({
            ...current,
            realtimeOnsetCount: realtimeOnsetCountRef.current,
          }));
          onRealtimeOnsetRef.current?.(message.time, message.peak);
        }
      };
      workletNode.port.onmessageerror = () => {
        console.warn('[recording] AudioWorklet message could not be decoded');
      };
      workletNode.port.postMessage({ type: 'start' });

      audioEngine.setOutputVolumeOverride(
        recordingSettings.includeClickInRecording
          ? recordingSettings.clickVolumeInRecording
          : 0,
      );

      setState((current) => ({ ...current, preparationStage: 'transport' }));
      if (!audioEngine.running) {
        const syncStarted = audioEngine.startSync();
        if (!syncStarted) {
          await withTimeout(
            audioEngine.start(),
            TRANSPORT_TIMEOUT_MS,
            'metronome transport startup',
            { signal: abortController.signal },
          );
        }
        transportStartedByRecordingRef.current = true;
        useMetronomeStore.getState().setPlaying(true);
      }

      recordingStartCtxTimeRef.current = context.currentTime;
      startTimeRef.current = Date.now();
      phaseRef.current = 'recording';
      startupAbortRef.current = null;

      setState({
        phase: 'recording',
        preparationStage: null,
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: micResult.isRaw,
        realtimeOnsetCount: 0,
        error: null,
      });

      timerRef.current = setInterval(() => {
        const recordingDuration = Date.now() - startTimeRef.current;
        if (recordingDuration >= MAX_RECORDING_MS) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          stopRecordingRef.current?.().then((result) => {
            if (result) onAutoStopRef.current?.(result);
          });
          return;
        }

        setState((current) => ({
          ...current,
          elapsed: Math.floor(recordingDuration / 1000),
          warning: recordingDuration >= WARNING_MS
            ? 'Recording will auto-stop at 30:00'
            : null,
        }));
      }, 1000);

      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      startupAbortRef.current = null;
      cleanupCaptureResources();
      await discardRecordingSink();
      stopTransportIfOwned();
      releaseActivity();

      if (error instanceof OperationCancelledError) {
        resetToIdle();
        return false;
      }

      phaseRef.current = 'error';
      setState({
        ...IDLE_STATE,
        phase: 'error',
        error: formatRecordingError(error),
      });
      return false;
    }
  }, [cleanupCaptureResources, discardRecordingSink, releaseActivity, resetToIdle, stopTransportIfOwned]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    if (phaseRef.current !== 'recording') return null;

    const operation = (async (): Promise<RecordingResult | null> => {
      let sink: RecordingSink | null = null;
      phaseRef.current = 'stopping';
      setState((current) => ({
        ...current,
        phase: 'stopping',
        isRecording: false,
        warning: null,
      }));

      try {
        const durationMs = Date.now() - startTimeRef.current;
        const context = audioEngine.getContext();
        const recordingEndTime = context?.currentTime ?? 0;
        const recordingStartTime = recordingStartCtxTimeRef.current;
        const scheduledBeats = audioEngine.scheduledBeats.filter(
          (beat) => beat.time >= recordingStartTime - 0.05,
        );

        workletNodeRef.current?.port.postMessage({ type: 'stop' });
        await delay(FINAL_FLUSH_MS);

        sink = recordingSinkRef.current;
        recordingSinkRef.current = null;
        if (!sink) throw new Error('Recording storage was unavailable');
        const pcmBlob = await sink.finalize();

        const metronome = useMetronomeStore.getState();
        const sessionBpm = metronome.bpm;
        const sessionMeterNum = metronome.meterNumerator;
        const sessionMeterDen = metronome.meterDenominator;
        const sessionSubdivision = metronome.subdivision;

        cleanupCaptureResources();
        stopTransportIfOwned();

        phaseRef.current = 'saving';
        setState((current) => ({ ...current, phase: 'saving' }));

        const activeProjectId = useProjectStore.getState().activeProjectId;
        const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const session: db.SessionRecord = {
          id: sessionId,
          date: new Date().toISOString(),
          projectId: activeProjectId,
          bpm: sessionBpm,
          meter: `${sessionMeterNum}/${sessionMeterDen}`,
          subdivision: sessionSubdivision,
          durationMs,
          totalHits: 0,
          avgDelta: 0,
          stdDev: 0,
          perfectPct: 0,
          hasRecording: true,
          analyzed: false,
        };

        await Promise.all([
          db.putSession(session),
          db.putRecording(sessionId, pcmBlob),
        ]);
        await sink.release();
        sink = null;
        await useSessionStore.getState().addSession(session);

        if (activeProjectId) {
          const project = useProjectStore.getState().projects.find(
            (candidate) => candidate.id === activeProjectId,
          );
          if (project) {
            await useProjectStore.getState().updateProject(activeProjectId, {
              sessionIds: [...project.sessionIds, sessionId],
              lastOpened: new Date().toISOString(),
            });
          }
        }

        resetToIdle();
        releaseActivity();
        return {
          sessionId,
          bpm: sessionBpm,
          meterNumerator: sessionMeterNum,
          meterDenominator: sessionMeterDen,
          subdivision: sessionSubdivision,
          durationMs,
          scheduledBeats,
          recordingStartTime,
          recordingEndTime,
        };
      } catch (error) {
        console.error('Failed to stop or save recording:', error);
        await sink?.discard();
        cleanupCaptureResources();
        stopTransportIfOwned();
        releaseActivity();
        phaseRef.current = 'error';
        setState({
          ...IDLE_STATE,
          phase: 'error',
          error: error instanceof Error && error.message === 'No audio samples were captured'
            ? 'No microphone audio was captured. Check the selected input and try again.'
            : 'The recording stopped, but the session could not be saved. Storage may be full.',
        });
        return null;
      } finally {
        stopPromiseRef.current = null;
      }
    })();

    stopPromiseRef.current = operation;
    return operation;
  }, [cleanupCaptureResources, releaseActivity, resetToIdle, stopTransportIfOwned]);

  stopRecordingRef.current = stopRecording;

  const toggleRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (phaseRef.current === 'preparing') {
      cancelPreparation();
      return null;
    }
    if (phaseRef.current === 'recording') return stopRecording();
    if (phaseRef.current === 'stopping' || phaseRef.current === 'saving') return null;
    await startRecording();
    return null;
  }, [cancelPreparation, startRecording, stopRecording]);

  const setOnRealtimeOnset = useCallback(
    (callback: ((time: number, peak: number) => void) | null) => {
      onRealtimeOnsetRef.current = callback;
    },
    [],
  );

  const setOnAutoStop = useCallback(
    (callback: ((result: RecordingResult) => void) | null) => {
      onAutoStopRef.current = callback;
    },
    [],
  );

  const clearError = useCallback(() => {
    if (phaseRef.current === 'error') phaseRef.current = 'idle';
    setState((current) => ({
      ...current,
      phase: current.phase === 'error' ? 'idle' : current.phase,
      error: null,
    }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording,
    cancelPreparation,
    setOnRealtimeOnset,
    setOnAutoStop,
    clearError,
  };
}
