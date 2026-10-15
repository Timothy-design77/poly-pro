import { useCallback, useEffect, useRef, useState } from 'react';
import { ensurePcmCaptureWorklet } from '../audio/worklets';
import { getPreferredMicStream } from '../utils/mic';
import { beginCriticalActivity, isCriticalActivityActive } from '../utils/critical-activity';
import { runAnalysisInWorker } from '../analysis/worker-client';
import { currentAnalysisConfig } from './useAnalysis';
import type { AnalysisConfig, DetectedOnset, SpectralFeatures } from '../analysis/types';

/** Training and session analysis use the same detector, sample rate and feature windows. */
export function useTrainingCapture() {
  const [hitCount, setHitCount] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const epoch = useRef(0);
  const resources = useRef<{ context: AudioContext; stream: MediaStream; worklet: AudioWorkletNode; chunks: Float32Array[]; samples: number; done: Promise<void>; finish: () => void } | null>(null);
  const release = useRef<(() => void) | null>(null);
  const cancelWorker = useRef<(() => void) | null>(null);
  const onLimit = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    epoch.current++; cancelWorker.current?.(); cancelWorker.current = null;
    const capture = resources.current; resources.current = null;
    if (capture) { capture.worklet.port.onmessage = null; capture.worklet.disconnect(); capture.stream.getTracks().forEach((track) => track.stop()); if (capture.context.state !== 'closed') void capture.context.close().catch(() => {}); capture.finish(); }
    release.current?.(); release.current = null; setPreparing(false);
  }, []);
  useEffect(() => stop, [stop]);

  const start = useCallback(async (onAutoStop: () => void) => {
    if (isCriticalActivityActive()) throw new Error('Finish the current recording, calibration or data operation first.');
    const token = ++epoch.current;
    release.current = beginCriticalActivity('training'); setPreparing(true); setHitCount(0); onLimit.current = onAutoStop;
    try {
      const { stream } = await getPreferredMicStream();
      if (token !== epoch.current) { stream.getTracks().forEach((track) => track.stop()); return false; }
      const context = new AudioContext();
      try { await context.resume(); await ensurePcmCaptureWorklet(context); }
      catch (error) { stream.getTracks().forEach((track) => track.stop()); void context.close().catch(() => {}); throw error; }
      if (token !== epoch.current) { stream.getTracks().forEach((track) => track.stop()); void context.close().catch(() => {}); return false; }
      const worklet = new AudioWorkletNode(context, 'pcm-capture-processor');
      const source = context.createMediaStreamSource(stream); const silent = context.createGain(); silent.gain.value = 0;
      source.connect(worklet); worklet.connect(silent); silent.connect(context.destination);
      let finish = () => {};
      const done = new Promise<void>((resolve) => { finish = resolve; });
      const capture = { context, stream, worklet, chunks: [] as Float32Array[], samples: 0, done, finish };
      resources.current = capture;
      let limited = false;
      worklet.port.onmessage = ({ data }) => {
        if (data.type === 'pcm') {
          const samples = data.samples as Float32Array;
          const remaining = Math.max(0, context.sampleRate * 60 - capture.samples);
          if (remaining) { const chunk = samples.subarray(0, remaining); capture.chunks.push(chunk); capture.samples += chunk.length; }
          if (capture.samples >= context.sampleRate * 60 && !limited) { limited = true; onLimit.current?.(); }
        } else if (data.type === 'onset') setHitCount((count) => count + 1);
        else if (data.type === 'done') finish();
      };
      stream.getAudioTracks().forEach((track) => { track.onended = () => onLimit.current?.(); });
      worklet.onprocessorerror = () => onLimit.current?.();
      worklet.port.postMessage({ type: 'start' }); setPreparing(false); return true;
    } catch (error) { if (token === epoch.current) stop(); throw error; }
  }, [stop]);

  const finish = useCallback(async (options: { bpm?: number; subdivision?: number } = {}): Promise<{ features: SpectralFeatures[]; onsets: DetectedOnset[]; pcmBlob: Blob; sampleRate: number; config: AnalysisConfig }> => {
    const capture = resources.current;
    if (!capture) throw new Error('No training recording is active.');
    const token = epoch.current;
    capture.worklet.port.postMessage({ type: 'stop' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([capture.done, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Training capture did not finish. Please try again.')), 2000); })]);
      clearTimeout(timeout);
      if (token !== epoch.current) throw new DOMException('Cancelled', 'AbortError');
      capture.stream.getTracks().forEach((track) => track.stop()); await capture.context.close();
      const pcmBlob = new Blob(capture.chunks.map((chunk) => new Float32Array(chunk).buffer));
      capture.chunks = [];
      const config = currentAnalysisConfig(capture.context.sampleRate);
      const run = runAnalysisInWorker({ pcmBlob, config, bpm: options.bpm ?? 120, meterNumerator: 4, meterDenominator: 4, subdivision: options.subdivision ?? 1, durationMs: capture.samples / capture.context.sampleRate * 1000, scheduledBeats: [], recordingStartTime: 0, recordingEndTime: capture.samples / capture.context.sampleRate });
      cancelWorker.current = run.cancel;
      const result = await run.promise;
      if (token !== epoch.current) throw new DOMException('Cancelled', 'AbortError');
      const features = result.scoredOnsets.flatMap((onset) => onset.spectralFeatures ? [onset.spectralFeatures] : []);
      setHitCount(features.length);
      return { features, onsets: result.rawOnsets, pcmBlob, sampleRate: capture.context.sampleRate, config };
    } finally { clearTimeout(timeout); if (token === epoch.current) stop(); }
  }, [stop]);
  return { start, stop, finish, hitCount, preparing };
}
