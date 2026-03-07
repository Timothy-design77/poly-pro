import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream, hasBtAudioOutput, verifyRawAudio } from '../utils/mic';
import * as db from '../store/db';
import { useNavStore, PAGE_PROGRESS } from '../store/nav-store';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;

export interface RecordingState {
  isRecording: boolean;
  elapsed: number;
  micLevel: number;
  warning: string | null;
  btTip: string | null; // One-time BT earbuds tip
  isRawAudio: boolean; // Whether processing is confirmed disabled
}

// Track whether worklet module has been loaded (survives re-renders)
let workletLoaded = false;

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    isRecording: false,
    elapsed: 0,
    micLevel: 0,
    warning: null,
    btTip: null,
    isRawAudio: false,
  });

  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<number[][]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) {
        cleanupRecording();
      }
    };
  }, []);

  /** Tear down mic/worklet without saving */
  const cleanupRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);

    if (workletNodeRef.current) {
      try { workletNodeRef.current.port.postMessage({ type: 'stop' }); } catch {}
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

      const ctx = await audioEngine.initContext();

      // Load worklet module (once per app lifetime)
      if (!workletLoaded) {
        const base = import.meta.env.BASE_URL || '/poly-pro/';
        await ctx.audioWorklet.addModule(`${base}worklets/pcm-capture.js`);
        workletLoaded = true;
      }

      // Get mic stream (prefer built-in, raw audio processing disabled)
      const stream = await getPreferredMicStream();
      micStreamRef.current = stream;

      // Verify raw audio is actually disabled
      const audioStatus = verifyRawAudio(stream);
      console.log('Audio processing status:', audioStatus);

      // Check for BT earbuds — show one-time tip
      const btDetected = await hasBtAudioOutput();
      const btTipShown = localStorage.getItem('poly-pro-bt-tip-shown');
      let btTip: string | null = null;
      if (btDetected && !btTipShown) {
        btTip = 'BT earbuds detected. If they switch to ambient mode, disable "Voice Detect" in Galaxy Wearable app.';
        localStorage.setItem('poly-pro-bt-tip-shown', '1');
      }

      // Connect: mic → worklet → silentGain(0) → destination
      // Worklet must be connected to destination for process() to fire,
      // but we use a gain node at 0 so no mic audio plays through speakers.
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      workletNodeRef.current = workletNode;

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      // Listen for messages from worklet
      pcmChunksRef.current = [];
      workletNode.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'pcm') {
          // Worklet sends Array<number>, not Float32Array (avoids transfer/detach issues)
          pcmChunksRef.current.push(msg.samples);
        } else if (msg.type === 'level') {
          setState((s) => ({ ...s, micLevel: msg.peak }));
        }
      };

      // Tell worklet to start capturing
      workletNode.port.postMessage({ type: 'start' });

      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      setState({
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: audioStatus.isRaw,
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
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
    }
  }, [cleanupRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    // Tell worklet to flush, then wait briefly
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }
    await new Promise((r) => setTimeout(r, 200));

    // Save chunks before cleanup
    const chunks = pcmChunksRef.current;
    const durationMs = Date.now() - startTimeRef.current;

    // Cleanup mic/worklet
    cleanupRecording();

    // Stop metronome
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);

    // Combine all chunks into a single Float32Array
    const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);

    if (totalSamples === 0) {
      console.warn('No audio captured');
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
      return;
    }

    const combined = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunksRef.current = [];

    // Build session record
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
      totalHits: 0,
      avgDelta: 0,
      stdDev: 0,
      perfectPct: 0,
      hasRecording: totalSamples > 0,
    };

    // Save to IDB
    const pcmBlob = new Blob([combined.buffer], { type: 'application/octet-stream' });
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

    setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });

    // Navigate to Progress page
    useNavStore.getState().navigateTo(PAGE_PROGRESS);

    return sessionId;
  }, [cleanupRecording]);

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
