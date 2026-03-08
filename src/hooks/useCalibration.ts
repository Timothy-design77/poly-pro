/**
 * useCalibration hook — orchestrates loopback chirp calibration.
 *
 * Flow:
 * 1. Acquire mic (same as recording — built-in mic forced)
 * 2. Load AudioWorklet for PCM capture
 * 3. Wait 500ms for noise floor
 * 4. Play 5 chirps, 1 second apart, recording all audio
 * 5. Stop recording, run cross-correlation
 * 6. Present results: offset, consistency, quality
 *
 * Falls back to manual if loopback fails.
 */

import { useState, useCallback, useRef } from 'react';
import { audioEngine } from '../audio/engine';
import { getPreferredMicStream } from '../utils/mic';
import {
  createChirpBuffer,
  playChirp,
  measureLatencies,
  computeCalibrationResult,
  CHIRP_COUNT,
  CHIRP_INTERVAL_S,
  NOISE_FLOOR_WAIT_S,
} from '../analysis/calibration';
import { useSettingsStore } from '../store/settings-store';

export type CalibrationStep = 'idle' | 'setup' | 'measuring' | 'results' | 'failed';

export interface CalibrationState {
  step: CalibrationStep;
  /** Which chirp is currently playing (1-based, 0 = not started) */
  chirpProgress: number;
  /** Final offset in ms */
  offsetMs: number;
  /** Consistency (std dev) in ms */
  consistencyMs: number;
  /** Quality rating */
  quality: 'excellent' | 'good' | 'poor' | 'failed';
  /** How many chirps were successfully detected */
  accepted: number;
  /** Error message if failed */
  error: string | null;
}

export function useCalibration() {
  const [state, setState] = useState<CalibrationState>({
    step: 'idle',
    chirpProgress: 0,
    offsetMs: 0,
    consistencyMs: 0,
    quality: 'failed',
    accepted: 0,
    error: null,
  });

  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const isRunningRef = useRef(false);

  const cleanup = useCallback(() => {
    isRunningRef.current = false;
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

  const runCalibration = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    setState({
      step: 'measuring',
      chirpProgress: 0,
      offsetMs: 0,
      consistencyMs: 0,
      quality: 'failed',
      accepted: 0,
      error: null,
    });

    try {
      // Stop metronome if running
      if (audioEngine.running) {
        audioEngine.stop();
      }

      // Get mic stream
      const micResult = await getPreferredMicStream();
      micStreamRef.current = micResult.stream;

      // Set up AudioWorklet
      const ctx = await audioEngine.initContext();
      const basePath = (import.meta as any).env?.BASE_URL || '/poly-pro/';
      await ctx.audioWorklet.addModule(`${basePath}worklets/pcm-capture.js`);

      const source = ctx.createMediaStreamSource(micResult.stream);
      micSourceRef.current = source;

      const workletNode = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      workletNodeRef.current = workletNode;

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      source.connect(workletNode);
      workletNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      // Collect PCM chunks
      pcmChunksRef.current = [];
      workletNode.port.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'pcm') {
          const arr = msg.samples instanceof Float32Array
            ? msg.samples
            : new Float32Array(msg.samples);
          pcmChunksRef.current.push(arr);
        }
      };

      // Start capturing
      workletNode.port.postMessage({ type: 'start' });
      const recordingStartTime = ctx.currentTime;

      // Wait for noise floor estimation
      await sleep(NOISE_FLOOR_WAIT_S * 1000);

      if (!isRunningRef.current) return;

      // Generate chirp buffer
      const chirpBuffer = createChirpBuffer(ctx);
      const chirpPlayTimes: number[] = [];

      // Play 5 chirps, 1 second apart
      for (let i = 0; i < CHIRP_COUNT; i++) {
        if (!isRunningRef.current) return;

        const playTime = ctx.currentTime + 0.05; // small scheduling buffer
        chirpPlayTimes.push(playTime);
        playChirp(ctx, chirpBuffer, playTime);

        setState((s) => ({ ...s, chirpProgress: i + 1 }));

        if (i < CHIRP_COUNT - 1) {
          await sleep(CHIRP_INTERVAL_S * 1000);
        }
      }

      // Wait for last chirp to be captured (+ 200ms buffer for latency)
      await sleep(500);

      if (!isRunningRef.current) return;

      // Stop worklet
      workletNode.port.postMessage({ type: 'stop' });
      await sleep(150);

      // Run cross-correlation
      const { latencies, correlations } = measureLatencies(
        pcmChunksRef.current,
        chirpPlayTimes,
        recordingStartTime,
        ctx.sampleRate,
      );

      const result = computeCalibrationResult(latencies, correlations);

      cleanup();

      if (result.quality === 'failed') {
        setState({
          step: 'failed',
          chirpProgress: CHIRP_COUNT,
          offsetMs: 0,
          consistencyMs: 0,
          quality: 'failed',
          accepted: result.accepted,
          error: "Couldn't detect chirps clearly. Try a quieter room or move your phone closer.",
        });
      } else {
        setState({
          step: 'results',
          chirpProgress: CHIRP_COUNT,
          offsetMs: result.offsetMs,
          consistencyMs: result.consistencyMs,
          quality: result.quality,
          accepted: result.accepted,
          error: null,
        });
      }
    } catch (err) {
      cleanup();
      console.error('Calibration failed:', err);
      setState({
        step: 'failed',
        chirpProgress: 0,
        offsetMs: 0,
        consistencyMs: 0,
        quality: 'failed',
        accepted: 0,
        error: err instanceof Error ? err.message : 'Calibration failed',
      });
    }
  }, [cleanup]);

  const acceptResult = useCallback(() => {
    if (state.step !== 'results') return;
    const settings = useSettingsStore.getState();
    settings.setLatencyOffset(state.offsetMs);
    settings.setLastCalibratedAt(new Date().toISOString());
    settings.setCalibrationConsistency(state.consistencyMs);
    setState((s) => ({ ...s, step: 'idle' }));
  }, [state.step, state.offsetMs, state.consistencyMs]);

  const cancel = useCallback(() => {
    isRunningRef.current = false;
    cleanup();
    setState({
      step: 'idle',
      chirpProgress: 0,
      offsetMs: 0,
      consistencyMs: 0,
      quality: 'failed',
      accepted: 0,
      error: null,
    });
  }, [cleanup]);

  const reset = useCallback(() => {
    setState({
      step: 'idle',
      chirpProgress: 0,
      offsetMs: 0,
      consistencyMs: 0,
      quality: 'failed',
      accepted: 0,
      error: null,
    });
  }, []);

  return {
    ...state,
    runCalibration,
    acceptResult,
    cancel,
    reset,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
