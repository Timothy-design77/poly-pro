import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream, hasBtAudioOutput } from '../utils/mic';
import * as db from '../store/db';
import type { ScheduledBeat } from '../audio/types';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;

export interface RecordingState {
  isRecording: boolean;
  elapsed: number;
  micLevel: number;
  warning: string | null;
  btTip: string | null;
  isRawAudio: boolean;
  /** Real-time onset count from Mode 1 (visual feedback only) */
  realtimeOnsetCount: number;
  /** User-facing error message (e.g., mic permission denied) */
  error: string | null;
}

/** Returned after recording stops — enough info to trigger analysis */
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

/**
 * Recording hook using AudioWorklet for raw PCM capture.
 *
 * Mic → createMediaStreamSource → AudioWorkletNode → raw Float32 PCM (48kHz)
 *
 * Phase 5 additions:
 * - Captures scheduledBeats from engine for grid alignment
 * - Tracks AudioContext recording start/end times
 * - Receives real-time onset detections from worklet (Mode 1)
 * - Returns RecordingResult for analysis pipeline
 */
export function useRecording() {
  const [state, setState] = useState<RecordingState>({
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
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);

  // Phase 5: capture engine state for analysis
  const recordingStartCtxTimeRef = useRef(0);
  const scheduledBeatsStartIdxRef = useRef(0);
  const realtimeOnsetCountRef = useRef(0);

  // Callback for real-time onset events (Mode 1 visual feedback)
  const onRealtimeOnsetRef = useRef<((time: number, peak: number) => void) | null>(null);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) cleanupRecording();
    };
  }, []);

  const cleanupRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);

    if (workletNodeRef.current) {
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
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    try {
      // Auto-start metronome if not running
      if (!audioEngine.running) {
        const started = audioEngine.startSync();
        if (!started) await audioEngine.start();
        useMetronomeStore.getState().setPlaying(true);
      }

      // Get mic stream — forces built-in mic to avoid BT HFP switch
      const micResult = await getPreferredMicStream();
      micStreamRef.current = micResult.stream;

      // BT tip
      const btDetected = await hasBtAudioOutput();
      let btTip: string | null = null;
      if (btDetected && !micResult.isBuiltIn) {
        btTip = `⚠️ Using "${micResult.deviceLabel}" — BT may switch to call mode.`;
      } else if (btDetected) {
        btTip = `Mic: ${micResult.deviceLabel}`;
      }

      // Set up AudioWorklet for raw PCM capture
      const ctx = await audioEngine.initContext();
      const basePath = (import.meta as any).env?.BASE_URL || '/poly-pro/';
      await ctx.audioWorklet.addModule(`${basePath}worklets/pcm-capture.js`);

      const source = ctx.createMediaStreamSource(micResult.stream);
      micSourceRef.current = source;

      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      workletNodeRef.current = workletNode;

      // Silent gain — keeps worklet alive without playing mic through speakers
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      // Phase 5: capture AudioContext time and scheduledBeats index at recording start
      recordingStartCtxTimeRef.current = ctx.currentTime;
      scheduledBeatsStartIdxRef.current = audioEngine.scheduledBeats.length;
      realtimeOnsetCountRef.current = 0;

      // Listen for PCM chunks, mic levels, and onset events from worklet
      pcmChunksRef.current = [];
      workletNode.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'pcm') {
          const arr = msg.samples instanceof Float32Array
            ? msg.samples
            : new Float32Array(msg.samples);
          pcmChunksRef.current.push(arr);
        } else if (msg.type === 'level') {
          setState((s) => ({ ...s, micLevel: msg.peak }));
        } else if (msg.type === 'onset') {
          // Mode 1: real-time onset detected in worklet
          realtimeOnsetCountRef.current++;
          setState((s) => ({
            ...s,
            realtimeOnsetCount: realtimeOnsetCountRef.current,
          }));
          // Notify external callback (e.g., for beat dot flash)
          onRealtimeOnsetRef.current?.(msg.time, msg.peak);
        }
      };

      workletNode.port.postMessage({ type: 'start' });

      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      setState({
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: true,
        realtimeOnsetCount: 0,
        error: null,
      });

      // Elapsed timer
      timerRef.current = setInterval(() => {
        const el = Math.floor((Date.now() - startTimeRef.current) / 1000);
        let warning: string | null = null;

        if (Date.now() - startTimeRef.current > WARNING_MS) {
          warning = 'Recording will auto-stop at 30:00';
        }
        if (Date.now() - startTimeRef.current > MAX_RECORDING_MS) {
          stopRecording();
          return;
        }

        setState((s) => ({ ...s, elapsed: el, warning }));
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      cleanupRecording();

      // Friendly error messages
      let errorMsg = 'Recording failed. Please try again.';
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = 'Microphone access denied. Enable mic permission in your browser settings and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'No microphone found. Connect a mic and try again.';
        } else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
          errorMsg = 'Microphone is in use by another app. Close other apps and try again.';
        }
      }

      setState({
        isRecording: false, elapsed: 0, micLevel: 0,
        warning: null, btTip: null, isRawAudio: false,
        realtimeOnsetCount: 0, error: errorMsg,
      });
    }
  }, [cleanupRecording]);

  const stopRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (!isRecordingRef.current) return null;

    const durationMs = Date.now() - startTimeRef.current;

    // Phase 5: capture AudioContext time at recording end
    const ctx = audioEngine.getContext();
    const recordingEndTime = ctx?.currentTime ?? 0;
    const recordingStartTime = recordingStartCtxTimeRef.current;

    // Phase 5: snapshot scheduledBeats from engine (beats during recording only)
    const allBeats = audioEngine.scheduledBeats;
    const startIdx = scheduledBeatsStartIdxRef.current;
    const scheduledBeats = allBeats.slice(startIdx);

    // Tell worklet to stop and flush remaining samples
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }
    await new Promise((r) => setTimeout(r, 150)); // Wait for final flush

    // Grab chunks
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    // Snapshot metronome state BEFORE stopping (engine reads might change)
    const metronome = useMetronomeStore.getState();
    const sessionBpm = metronome.bpm;
    const sessionMeterNum = metronome.meterNumerator;
    const sessionMeterDen = metronome.meterDenominator;
    const sessionSubdivision = metronome.subdivision;

    // Cleanup
    cleanupRecording();
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);

    if (chunks.length === 0) {
      console.warn('No audio captured');
      setState({
        isRecording: false, elapsed: 0, micLevel: 0,
        warning: null, btTip: null, isRawAudio: false,
        realtimeOnsetCount: 0, error: null,
      });
      return null;
    }

    // Combine float32 chunks into single buffer
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const pcmBlob = new Blob([combined.buffer], { type: 'application/octet-stream' });

    // Build session record
    const activeProjectId = useProjectStore.getState().activeProjectId;
    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

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

    // Save to IDB — raw PCM for analysis + playback
    await Promise.all([
      db.putSession(session),
      db.putRecording(sessionId, pcmBlob),
    ]);

    // Update stores
    await useSessionStore.getState().addSession(session);

    if (activeProjectId) {
      const project = useProjectStore.getState().projects.find((p) => p.id === activeProjectId);
      if (project) {
        await useProjectStore.getState().updateProject(activeProjectId, {
          sessionIds: [...project.sessionIds, sessionId],
          lastOpened: new Date().toISOString(),
        });
      }
    }

    setState({
      isRecording: false, elapsed: 0, micLevel: 0,
      warning: null, btTip: null, isRawAudio: false,
      realtimeOnsetCount: 0, error: null,
    });

    // Return analysis params (caller handles navigation + analysis trigger)
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
  }, [cleanupRecording]);

  const toggleRecording = useCallback(async (): Promise<RecordingResult | null> => {
    if (isRecordingRef.current) {
      return stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [startRecording, stopRecording]);

  /** Register callback for real-time onset events (Mode 1 visual feedback) */
  const setOnRealtimeOnset = useCallback(
    (cb: ((time: number, peak: number) => void) | null) => {
      onRealtimeOnsetRef.current = cb;
    },
    [],
  );

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording,
    setOnRealtimeOnset,
    clearError,
  };
}
