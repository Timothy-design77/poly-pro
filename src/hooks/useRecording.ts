import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';
import { useProjectStore } from '../store/project-store';
import { useSessionStore } from '../store/session-store';
import { getPreferredMicStream, hasBtAudioOutput } from '../utils/mic';
import * as db from '../store/db';
import { useNavStore, PAGE_PROGRESS } from '../store/nav-store';

const MAX_RECORDING_MS = 30 * 60 * 1000;
const WARNING_MS = 25 * 60 * 1000;

export interface RecordingState {
  isRecording: boolean;
  elapsed: number;
  micLevel: number;
  warning: string | null;
  btTip: string | null;
  isRawAudio: boolean;
}

/**
 * Recording hook using AudioWorklet for raw PCM capture.
 *
 * Mic → createMediaStreamSource → AudioWorkletNode → raw Float32 PCM (48kHz)
 *
 * The mic connects to the SAME AudioContext as the metronome. This does NOT
 * trigger Android call mode / BT HFP switch because we force the built-in
 * mic via explicit deviceId (see mic.ts). The BT earbuds stay on A2DP for
 * high-quality output while the phone mic handles input.
 *
 * Benefits over MediaRecorder:
 * - True raw Float32 PCM at 48kHz (no Opus encode/decode round-trip)
 * - Real-time mic level metering for waveform display
 * - Real-time onset detection possible (Phase 5 Mode 1)
 * - No 173MB decodeAudioData() memory spike after 30-min recording
 */
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
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);

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

      // Listen for PCM chunks and mic levels from worklet
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
        }
      };

      workletNode.port.postMessage({ type: 'start' });

      // Boost metronome volume to compensate for any residual Android ducking
      audioEngine.setRecordingBoost(true);

      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      setState({
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: true,
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
      audioEngine.setRecordingBoost(false);
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
    }
  }, [cleanupRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    const durationMs = Date.now() - startTimeRef.current;

    // Tell worklet to stop and flush remaining samples
    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
    }
    await new Promise((r) => setTimeout(r, 150)); // Wait for final flush

    // Grab chunks
    const chunks = pcmChunksRef.current;
    pcmChunksRef.current = [];

    // Cleanup
    cleanupRecording();
    audioEngine.setRecordingBoost(false);
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);

    if (chunks.length === 0) {
      console.warn('No audio captured');
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
      return;
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
      hasRecording: true,
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

    setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
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
