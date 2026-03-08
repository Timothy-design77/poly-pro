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

/** Check debug toggle for AudioWorklet mode */
function isWorkletMode(): boolean {
  try { return localStorage.getItem('poly-pro-debug-worklet') === '1'; } catch { return false; }
}

export interface RecordingState {
  isRecording: boolean;
  elapsed: number;
  micLevel: number;
  warning: string | null;
  btTip: string | null;
  isRawAudio: boolean;
}

/**
 * Recording hook — supports two capture modes:
 *
 * MODE A (default): MediaRecorder
 *   Mic never touches AudioContext. No Android ducking.
 *   Produces Opus/WebM → decodeAudioData → Float32 PCM post-recording.
 *
 * MODE B (debug toggle): AudioWorklet
 *   Mic connects to AudioContext via createMediaStreamSource.
 *   Produces raw Float32 PCM in real-time via worklet MessagePort.
 *   MAY trigger Android ducking — this mode exists to test that hypothesis.
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
  // MediaRecorder mode refs
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // AudioWorklet mode refs
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const modeRef = useRef<'mediarecorder' | 'worklet'>('mediarecorder');

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

    // MediaRecorder cleanup
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;

    // AudioWorklet cleanup
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

    // Mic cleanup
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;
    const useWorklet = isWorkletMode();
    modeRef.current = useWorklet ? 'worklet' : 'mediarecorder';

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
        btTip = `Mic: ${micResult.deviceLabel}${useWorklet ? ' [Worklet mode]' : ''}`;
      } else if (useWorklet) {
        btTip = `Worklet mode — mic: ${micResult.deviceLabel}`;
      }

      if (useWorklet) {
        // ─── MODE B: AudioWorklet ───
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

        pcmChunksRef.current = [];
        workletNode.port.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === 'pcm') {
            // samples is Float32Array (transferred)
            const arr = msg.samples instanceof Float32Array
              ? msg.samples
              : new Float32Array(msg.samples);
            pcmChunksRef.current.push(arr);
          } else if (msg.type === 'level') {
            setState((s) => ({ ...s, micLevel: msg.peak }));
          }
        };

        workletNode.port.postMessage({ type: 'start' });

      } else {
        // ─── MODE A: MediaRecorder ───
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        const recorder = new MediaRecorder(micResult.stream, {
          mimeType,
          audioBitsPerSecond: 256000,
        });
        recorderRef.current = recorder;

        chunksRef.current = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(1000);
      }

      // Boost metronome volume to compensate for any Android ducking
      audioEngine.setRecordingBoost(true);

      isRecordingRef.current = true;
      startTimeRef.current = Date.now();

      setState({
        isRecording: true,
        elapsed: 0,
        micLevel: 0,
        warning: null,
        btTip,
        isRawAudio: useWorklet,
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
    const mode = modeRef.current;

    let pcmBlob: Blob;
    let playbackBlob: Blob | null = null;

    if (mode === 'worklet') {
      // ─── Stop AudioWorklet ───
      if (workletNodeRef.current) {
        workletNodeRef.current.port.postMessage({ type: 'stop' });
      }
      await new Promise((r) => setTimeout(r, 150)); // Wait for final flush

      const chunks = pcmChunksRef.current;
      pcmChunksRef.current = [];

      // Combine float32 chunks into single buffer
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      pcmBlob = new Blob([combined.buffer], { type: 'application/octet-stream' });
      // No compressed playback blob in worklet mode — play from PCM

    } else {
      // ─── Stop MediaRecorder ───
      await new Promise<void>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') { resolve(); return; }
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      const chunks = chunksRef.current;
      chunksRef.current = [];

      if (chunks.length === 0) {
        cleanupRecording();
        audioEngine.setRecordingBoost(false);
        audioEngine.stop();
        useMetronomeStore.getState().setPlaying(false);
        setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
        return;
      }

      const audioBlob = new Blob(chunks, { type: chunks[0].type });
      playbackBlob = audioBlob;

      // Decode to raw PCM
      try {
        const ctx = await audioEngine.initContext();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const pcmData = audioBuffer.getChannelData(0);
        const copy = new Float32Array(pcmData.length);
        copy.set(pcmData);
        pcmBlob = new Blob([copy.buffer], { type: 'application/octet-stream' });
      } catch (err) {
        console.error('Failed to decode audio to PCM:', err);
        pcmBlob = audioBlob;
      }
    }

    // Cleanup
    cleanupRecording();
    audioEngine.setRecordingBoost(false);
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);

    // Build session
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

    // Save to IDB
    const saves: Promise<void>[] = [
      db.putSession(session),
      db.putRecording(sessionId, pcmBlob),
    ];
    if (playbackBlob) {
      saves.push(db.putRecording(sessionId + '-playback', playbackBlob));
    }
    await Promise.all(saves);

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
