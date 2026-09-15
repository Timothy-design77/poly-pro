/** Loopback chirp calibration with update/lifecycle protection. */
import { useState, useCallback, useRef } from 'react';
import { audioEngine } from '../audio';
import { ensurePcmCaptureWorklet } from '../audio/worklets';
import { getPreferredMicStream } from '../utils/mic';
import { beginCriticalActivity } from '../utils/critical-activity';
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
  chirpProgress: number;
  offsetMs: number;
  consistencyMs: number;
  quality: 'excellent' | 'good' | 'poor' | 'failed';
  accepted: number;
  error: string | null;
}

export function useCalibration() {
  const [state, setState] = useState<CalibrationState>({ step: 'idle', chirpProgress: 0, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: 0, error: null });
  const micStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const isRunningRef = useRef(false);
  const releaseCriticalRef = useRef<(() => void) | null>(null);

  const cleanup = useCallback(() => {
    isRunningRef.current = false;
    if (workletNodeRef.current) { workletNodeRef.current.port.onmessage = null; try { workletNodeRef.current.disconnect(); } catch {} workletNodeRef.current = null; }
    if (micSourceRef.current) { try { micSourceRef.current.disconnect(); } catch {} micSourceRef.current = null; }
    if (silentGainRef.current) { try { silentGainRef.current.disconnect(); } catch {} silentGainRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach((track) => track.stop()); micStreamRef.current = null; }
    releaseCriticalRef.current?.();
    releaseCriticalRef.current = null;
  }, []);

  const runCalibration = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    releaseCriticalRef.current = beginCriticalActivity('calibration');
    setState({ step: 'measuring', chirpProgress: 0, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: 0, error: null });

    try {
      if (audioEngine.running) audioEngine.stop();
      const micResult = await getPreferredMicStream();
      micStreamRef.current = micResult.stream;
      const ctx = await audioEngine.initContext();
      await ensurePcmCaptureWorklet(ctx);
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

      pcmChunksRef.current = [];
      workletNode.port.onmessage = (event) => {
        if (event.data.type !== 'pcm') return;
        const samples = event.data.samples instanceof Float32Array ? event.data.samples : new Float32Array(event.data.samples);
        pcmChunksRef.current.push(samples);
      };

      workletNode.port.postMessage({ type: 'start' });
      const recordingStartTime = ctx.currentTime;
      await sleep(NOISE_FLOOR_WAIT_S * 1000);
      if (!isRunningRef.current) return;

      const chirpBuffer = createChirpBuffer(ctx);
      const chirpPlayTimes: number[] = [];
      const firstChirpTime = ctx.currentTime + 0.1;
      for (let i = 0; i < CHIRP_COUNT; i++) {
        const playTime = firstChirpTime + i * CHIRP_INTERVAL_S;
        chirpPlayTimes.push(playTime);
        playChirp(ctx, chirpBuffer, playTime);
      }

      for (let i = 0; i < CHIRP_COUNT; i++) {
        if (!isRunningRef.current) return;
        const waitUntil = (chirpPlayTimes[i] - ctx.currentTime) * 1000 + 200;
        if (waitUntil > 0) await sleep(waitUntil);
        setState((current) => ({ ...current, chirpProgress: i + 1 }));
      }
      await sleep(500);
      if (!isRunningRef.current) return;
      workletNode.port.postMessage({ type: 'stop' });
      await sleep(150);

      const { latencies, correlations } = measureLatencies(pcmChunksRef.current, chirpPlayTimes, recordingStartTime, ctx.sampleRate);
      const result = computeCalibrationResult(latencies, correlations);
      cleanup();
      if (result.quality === 'failed') {
        setState({ step: 'failed', chirpProgress: CHIRP_COUNT, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: result.accepted, error: "Couldn't detect chirps clearly. Try a quieter room or move your phone closer." });
      } else {
        setState({ step: 'results', chirpProgress: CHIRP_COUNT, offsetMs: result.offsetMs, consistencyMs: result.consistencyMs, quality: result.quality, accepted: result.accepted, error: null });
      }
    } catch (error) {
      cleanup();
      console.error('Calibration failed:', error);
      setState({ step: 'failed', chirpProgress: 0, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: 0, error: error instanceof Error ? error.message : 'Calibration failed' });
    }
  }, [cleanup]);

  const acceptResult = useCallback(() => {
    if (state.step !== 'results') return;
    const settings = useSettingsStore.getState();
    settings.setCalibratedOffset(state.offsetMs);
    settings.setManualAdjustment(0);
    settings.setLastCalibratedAt(new Date().toISOString());
    settings.setCalibrationConsistency(state.consistencyMs);
    setState((current) => ({ ...current, step: 'idle' }));
  }, [state.step, state.offsetMs, state.consistencyMs]);

  const cancel = useCallback(() => {
    cleanup();
    setState({ step: 'idle', chirpProgress: 0, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: 0, error: null });
  }, [cleanup]);

  const reset = useCallback(() => {
    setState({ step: 'idle', chirpProgress: 0, offsetMs: 0, consistencyMs: 0, quality: 'failed', accepted: 0, error: null });
  }, []);

  return { ...state, runCalibration, acceptResult, cancel, reset };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
