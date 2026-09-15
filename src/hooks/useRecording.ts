import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio';
import { ensurePcmCaptureWorklet } from '../audio/worklets';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream, hasBtAudioOutput } from '../utils/mic';
import { beginCriticalActivity } from '../utils/critical-activity';
import * as db from '../store/db';
import type { ScheduledBeat } from '../audio/types';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;
const MIC_TIMEOUT_MS = 15_000;
const WORKLET_FLUSH_TIMEOUT_MS = 2_000;

export type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'stopping' | 'saving' | 'error';

export interface RecordingState {
  phase: RecordingPhase;
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

function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

async function preferredMicWithTimeout(): Promise<Awaited<ReturnType<typeof getPreferredMicStream>>> {
  const request = getPreferredMicStream();
  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('Microphone setup timed out. Check browser microphone permission and try again.')), MIC_TIMEOUT_MS);
  });
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    // If getUserMedia resolves after our timeout, stop that late stream instead
    // of leaking an active microphone track.
    request.then((result) => result.stream.getTracks().forEach((track) => track.stop())).catch(() => {});
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    phase: 'idle',
    isRecording: false,
    elapsed: 0,
    micLevel: 0,
    warning: null,
    btTip: null,
    isRawAudio: false,
    realtimeOnsetCount: 0,
    error: null,
  });

  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);
  const phaseRef = useRef<RecordingPhase>('idle');
  const recordingStartCtxTimeRef = useRef(0);
  const realtimeOnsetCountRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const sampleRateRef = useRef(48000);
  const chunkIndexRef = useRef(0);
  const writeChainRef = useRef<Promise<void>>(Promise.resolve());
  const writeErrorRef = useRef<unknown>(null);
  const donePromiseRef = useRef<Promise<void> | null>(null);
  const doneResolveRef = useRef<(() => void) | null>(null);
  const releaseCriticalRef = useRef<(() => void) | null>(null);
  const metronomeWasRunningRef = useRef(false);
  const recordingConfigRef = useRef({ bpm: 120, meterNumerator: 4, meterDenominator: 4, subdivision: 1 });

  const onRealtimeOnsetRef = useRef<((time: number, peak: number) => void) | null>(null);
  const onAutoStopRef = useRef<((result: RecordingResult) => void) | null>(null);

  const setPhase = useCallback((phase: RecordingPhase) => {
    phaseRef.current = phase;
    setState((current) => ({ ...current, phase }));
  }, []);

  const releaseCritical = useCallback(() => {
    releaseCriticalRef.current?.();
    releaseCriticalRef.current = null;
  }, []);

  const cleanupRecording = useCallback(() => {
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
    cleanupRecording();
    releaseCritical();
  }, [cleanupRecording, releaseCritical]);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current || !['idle', 'error'].includes(phaseRef.current)) return;

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;
    releaseCriticalRef.current = beginCriticalActivity('recording');
    setState((current) => ({ ...current, phase: 'preparing', error: null, warning: 'Preparing microphone…' }));
    phaseRef.current = 'preparing';

    try {
      const micResult = await preferredMicWithTimeout();
      micStreamRef.current = micResult.stream;
      const btDetected = await hasBtAudioOutput().catch(() => false);
      const btTip = btDetected
        ? micResult.isBuiltIn
          ? `Mic: ${micResult.deviceLabel}`
          : `Using "${micResult.deviceLabel}" — Bluetooth may switch to call mode.`
        : null;

      const ctx = await audioEngine.initContext();
      await ensurePcmCaptureWorklet(ctx);
      sampleRateRef.current = ctx.sampleRate;

      const metronome = useMetronomeStore.getState();
      recordingConfigRef.current = {
        bpm: metronome.bpm,
        meterNumerator: metronome.meterNumerator,
        meterDenominator: metronome.meterDenominator,
        subdivision: metronome.subdivision,
      };
      metronomeWasRunningRef.current = audioEngine.running;

      await db.beginChunkedRecording(sessionId, ctx.sampleRate);
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
          writeChainRef.current = writeChainRef.current.then(async () => {
            if (writeErrorRef.current) return;
            try {
              await db.appendRecordingChunk(sessionId, index, samples);
            } catch (error) {
              writeErrorRef.current = error;
            }
          });
        } else if (message.type === 'done') {
          doneResolveRef.current?.();
          doneResolveRef.current = null;
        } else if (message.type === 'level') {
          setState((current) => ({ ...current, micLevel: message.peak }));
        } else if (message.type === 'onset') {
          realtimeOnsetCountRef.current++;
          setState((current) => ({ ...current, realtimeOnsetCount: realtimeOnsetCountRef.current }));
          onRealtimeOnsetRef.current?.(message.time, message.peak);
        }
      };

      workletNode.port.postMessage({ type: 'start' });
      recordingStartCtxTimeRef.current = ctx.currentTime;
      startTimeRef.current = Date.now();
      isRecordingRef.current = true;

      // Start the metronome only after capture is ready. This guarantees that
      // every auto-started click belongs to the stored recording timeline.
      if (!audioEngine.running) {
        const started = audioEngine.startSync();
        if (!started) await audioEngine.start();
        useMetronomeStore.getState().setPlaying(true);
      }

      setState({
        phase: 'recording',
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: micResult.isRaw,
        realtimeOnsetCount: 0,
        error: null,
      });
      phaseRef.current = 'recording';

      timerRef.current = setInterval(() => {
        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsed = Math.floor(elapsedMs / 1000);
        const warning = elapsedMs > WARNING_MS ? 'Recording will auto-stop at 30:00' : null;
        if (elapsedMs > MAX_RECORDING_MS) {
          stopRecording().then((result) => { if (result) onAutoStopRef.current?.(result); });
          return;
        }
        setState((current) => ({ ...current, elapsed, warning }));
      }, 1000);
    } catch (error) {
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
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') message = 'Microphone access denied. Enable microphone permission and try again.';
        else if (error.name === 'NotFoundError') message = 'No microphone found.';
        else if (error.name === 'NotReadableError' || error.name === 'AbortError') message = 'Microphone is unavailable or in use by another app.';
      }
      phaseRef.current = 'error';
      setState({ phase: 'error', isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false, realtimeOnsetCount: 0, error: message });
    }
  }, [cleanupRecording, releaseCritical]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isRecordingRef.current || phaseRef.current !== 'recording') return null;
    isRecordingRef.current = false;
    setPhase('stopping');
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = undefined;

    const sessionId = sessionIdRef.current;
    if (!sessionId) return null;

    try {
      const durationMs = Date.now() - startTimeRef.current;
      const ctx = audioEngine.getContext();
      const recordingEndTime = ctx?.currentTime ?? 0;
      const recordingStartTime = recordingStartCtxTimeRef.current;
      const scheduledBeats = audioEngine.scheduledBeats.filter(
        (beat) => beat.time >= recordingStartTime - 0.01 && beat.time <= recordingEndTime + 0.11,
      );

      workletNodeRef.current?.port.postMessage({ type: 'stop' });
      if (donePromiseRef.current) {
        await Promise.race([
          donePromiseRef.current,
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Audio capture did not flush cleanly.')), WORKLET_FLUSH_TIMEOUT_MS)),
        ]);
      }
      await writeChainRef.current;
      if (writeErrorRef.current) throw writeErrorRef.current;

      setPhase('saving');
      const config = recordingConfigRef.current;
      const manifest = await db.finalizeChunkedRecording(sessionId);
      const activeProjectId = useProjectStore.getState().activeProjectId;
      const session: db.SessionRecord = {
        id: sessionId,
        date: new Date(startTimeRef.current).toISOString(),
        projectId: activeProjectId,
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
      };

      await useSessionStore.getState().addSession(session);
      if (activeProjectId) {
        const project = useProjectStore.getState().projects.find((item) => item.id === activeProjectId);
        if (project) {
          useProjectStore.getState().updateProject(activeProjectId, {
            sessionIds: project.sessionIds.includes(sessionId) ? project.sessionIds : [...project.sessionIds, sessionId],
            lastOpened: new Date().toISOString(),
          }).catch(console.error);
        }
      }

      cleanupRecording();
      audioEngine.stop();
      useMetronomeStore.getState().setPlaying(false);
      releaseCritical();
      phaseRef.current = 'idle';
      setState({ phase: 'idle', isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false, realtimeOnsetCount: 0, error: null });

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
      phaseRef.current = 'error';
      setState((current) => ({
        ...current,
        phase: 'error',
        isRecording: false,
        warning: null,
        error: `Recording stopped, but saving did not complete: ${error instanceof Error ? error.message : 'unknown storage error'}`,
      }));
      return null;
    }
  }, [cleanupRecording, releaseCritical, setPhase]);

  const toggleRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (phaseRef.current === 'recording') return stopRecording();
    if (phaseRef.current === 'idle' || phaseRef.current === 'error') await startRecording();
    return null;
  }, [startRecording, stopRecording]);

  const setOnRealtimeOnset = useCallback((cb: ((time: number, peak: number) => void) | null) => {
    onRealtimeOnsetRef.current = cb;
  }, []);

  const setOnAutoStop = useCallback((cb: ((result: RecordingResult) => void) | null) => {
    onAutoStopRef.current = cb;
  }, []);

  const clearError = useCallback(() => {
    phaseRef.current = 'idle';
    setState((current) => ({ ...current, phase: 'idle', error: null }));
  }, []);

  return { ...state, startRecording, stopRecording, toggleRecording, setOnRealtimeOnset, setOnAutoStop, clearError };
}
