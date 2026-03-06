import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream } from '../utils/mic';
import * as db from '../store/db';
import { useNavStore, PAGE_PROGRESS } from '../store/nav-store';

const MAX_RECORDING_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 25 * 60 * 1000; // Warning at 25 min

export interface RecordingState {
  isRecording: boolean;
  elapsed: number; // seconds
  micLevel: number; // 0-1 peak level for waveform
  warning: string | null;
}

/**
 * Full recording lifecycle hook.
 * - Captures raw PCM at 48kHz via AudioWorklet
 * - Stores 1-second chunks to accumulator
 * - On stop: saves session to IDB
 * - Auto-starts metronome if not running
 */
export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    elapsed: 0,
    micLevel: 0,
    warning: null,
  });

  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        stopRecording();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const ctx = await audioEngine.initContext();

      // Load the AudioWorklet processor
      const base = import.meta.env.BASE_URL || '/poly-pro/';
      await ctx.audioWorklet.addModule(`${base}worklets/pcm-capture.js`);

      // Get mic stream (prefer built-in, avoid BT)
      const stream = await getPreferredMicStream();
      micStreamRef.current = stream;

      // Connect mic → AudioWorklet
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      workletNodeRef.current = workletNode;

      // Listen for messages from worklet
      pcmChunksRef.current = [];
      workletNode.port.onmessage = (e) => {
        if (e.data.type === 'pcm') {
          pcmChunksRef.current.push(e.data.samples);
        } else if (e.data.type === 'level') {
          setState((s) => ({ ...s, micLevel: e.data.peak }));
        }
      };

      source.connect(workletNode);
      // Don't connect worklet to destination — we don't want mic playback
      workletNode.connect(ctx.destination); // Required for process() to fire, but gain is 0 in worklet

      // Actually — worklet needs to be connected but we don't want audio through.
      // The worklet doesn't output anything, so connecting to destination is fine.

      // Tell worklet to start capturing
      workletNode.port.postMessage({ type: 'start' });

      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      setState({
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
      });

      // Elapsed timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        let warning: string | null = null;

        if (Date.now() - startTimeRef.current > WARNING_MS) {
          warning = 'Recording will auto-stop at 30:00';
        }

        if (Date.now() - startTimeRef.current > MAX_RECORDING_MS) {
          stopRecording();
          return;
        }

        setState((s) => ({ ...s, elapsed, warning }));
      }, 1000);

    } catch (err) {
      console.error('Failed to start recording:', err);
      setState((s) => ({ ...s, isRecording: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    if (timerRef.current) clearInterval(timerRef.current);

    // Tell worklet to stop and flush
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }

    // Wait a moment for final flush
    await new Promise((r) => setTimeout(r, 100));

    // Disconnect and close mic
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (micSourceRef.current) {
      micSourceRef.current.disconnect();
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    // Combine all PCM chunks into single blob
    const chunks = pcmChunksRef.current;
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunksRef.current = [];

    // Save session
    const durationMs = Date.now() - startTimeRef.current;
    const metronome = useMetronomeStore.getState();
    const activeProjectId = useProjectStore.getState().activeProjectId;

    const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session: db.SessionRecord = {
      id: sessionId,
      date: new Date().toISOString(),
      projectId: activeProjectId,
      bpm: metronome.bpm,
      meter: `${metronome.meterNumerator}/${metronome.meterDenominator}`,
      subdivision: metronome.subdivision,
      durationMs,
      totalHits: 0, // Filled by analysis in Phase 5
      avgDelta: 0,
      stdDev: 0,
      perfectPct: 0,
      hasRecording: true,
    };

    // Save session record and PCM blob to IDB
    const pcmBlob = new Blob([combined.buffer], { type: 'audio/float32' });
    await Promise.all([
      db.putSession(session),
      db.putRecording(sessionId, pcmBlob),
    ]);

    // Add to session store
    await useSessionStore.getState().addSession(session);

    // Update project's session list
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
      isRecording: false,
      elapsed: 0,
      micLevel: 0,
      warning: null,
    });

    // Navigate to Progress page to see the new session
    useNavStore.getState().navigateTo(PAGE_PROGRESS);

    return sessionId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRecording = useCallback(async () => {
    if (isRecordingRef.current) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [startRecording, stopRecording]);

  return {
    ...state,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
