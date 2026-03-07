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
 * Recording hook using MediaRecorder (NOT AudioWorklet).
 *
 * WHY: Connecting a mic stream to ANY AudioContext triggers Android's
 * "communication mode" which ducks all audio output system-wide.
 * MediaRecorder captures independently — no AudioContext connection,
 * no volume ducking. Metronome stays at full volume during recording.
 *
 * After recording stops, we decode the compressed audio to raw PCM
 * via decodeAudioData() for onset analysis. Timing precision of
 * decoded Opus is sub-millisecond — more than sufficient.
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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const isRecordingRef = useRef(false);

  // No mic level metering during recording — connecting mic to ANY
  // AudioContext triggers Android volume ducking. Waveform display
  // will show a static "recording" indicator instead.

  useEffect(() => {
    return () => {
      if (isRecordingRef.current) cleanupRecording();
    };
  }, []);

  const cleanupRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch {}
    }
    recorderRef.current = null;

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

      // Get mic stream
      const stream = await getPreferredMicStream();
      micStreamRef.current = stream;

      // Check for BT earbuds
      const btDetected = await hasBtAudioOutput();
      const btTipShown = localStorage.getItem('poly-pro-bt-tip-shown');
      let btTip: string | null = null;
      if (btDetected && !btTipShown) {
        btTip = 'BT earbuds detected. If they switch to ambient mode, disable "Voice Detect" in Galaxy Wearable app.';
        localStorage.setItem('poly-pro-bt-tip-shown', '1');
      }

      // Set up MediaRecorder — captures audio WITHOUT connecting to AudioContext
      // This is the key difference from AudioWorklet approach: no ducking
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 256000, // 256kbps — better percussion transient quality
      });
      recorderRef.current = recorder;

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(1000); // Collect data every 1 second

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
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
    }
  }, [cleanupRecording]);

  const stopRecording = useCallback(async () => {
    if (!isRecordingRef.current) return;

    const durationMs = Date.now() - startTimeRef.current;

    // Stop recorder and wait for final data
    await new Promise<void>((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve();
        return;
      }
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    // Grab chunks before cleanup
    const chunks = chunksRef.current;
    chunksRef.current = [];

    // Cleanup mic/recorder/meter
    cleanupRecording();

    // Stop metronome
    audioEngine.stop();
    useMetronomeStore.getState().setPlaying(false);

    if (chunks.length === 0) {
      console.warn('No audio captured');
      setState({ isRecording: false, elapsed: 0, micLevel: 0, warning: null, btTip: null, isRawAudio: false });
      return;
    }

    // Combine MediaRecorder chunks into a single blob
    const audioBlob = new Blob(chunks, { type: chunks[0].type });

    // Decode to raw PCM for analysis
    let pcmBlob: Blob;
    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const pcmData = audioBuffer.getChannelData(0); // mono
      pcmBlob = new Blob([pcmData.buffer], { type: 'application/octet-stream' });
    } catch (err) {
      console.error('Failed to decode audio to PCM:', err);
      // Fall back to saving the compressed blob directly
      pcmBlob = audioBlob;
    }

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

    // Save to IDB — PCM for analysis, also keep compressed for playback
    await Promise.all([
      db.putSession(session),
      db.putRecording(sessionId, pcmBlob),
      db.putRecording(sessionId + '-playback', audioBlob),
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
