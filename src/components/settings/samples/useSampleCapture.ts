/**
 * Microphone capture for custom samples (up to 4 seconds). The capture
 * lifecycle is unchanged from the original CustomSampleManager; it only moved
 * here so the manager can stay presentational.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ensurePcmCaptureWorklet } from '../../../audio/worklets';
import { getPreferredMicStream } from '../../../utils/mic';
import { beginCriticalActivity, isCriticalActivityActive } from '../../../utils/critical-activity';
import { resample } from './sampleAudio';

export type CaptureState = 'idle' | 'preparing' | 'recording';
export const MAX_SAMPLE_MS = 4000;

/** `onCaptured` receives the merged take resampled to 48 kHz. */
export function useSampleCapture(onCaptured: (pcm: Float32Array) => void, onError: (message: string) => void) {
  const [state, setState] = useState<CaptureState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const generationRef = useRef(0);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const doneRef = useRef<Promise<void> | null>(null);
  const stopRef = useRef<() => void>(() => {});
  const releaseRef = useRef<(() => void) | null>(null);
  const sampleRateRef = useRef(48000);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const timerRef = useRef<number>(0);
  const callbacks = useRef({ onCaptured, onError });
  callbacks.current = { onCaptured, onError };

  const releaseDevices = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (isCriticalActivityActive()) { callbacks.current.onError('Finish the current recording, analysis or data operation first.'); return; }
    const generation = ++generationRef.current;
    releaseRef.current = beginCriticalActivity('recording');
    setState('preparing');
    chunksRef.current = [];
    setElapsedMs(0);

    try {
      const { stream } = await getPreferredMicStream();
      if (generation !== generationRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: 48000 }); audioCtxRef.current = ctx;
      await ctx.resume(); await ensurePcmCaptureWorklet(ctx);
      if (generation !== generationRef.current) return;
      sampleRateRef.current = ctx.sampleRate;
      const source = ctx.createMediaStreamSource(stream);
      const processor = new AudioWorkletNode(ctx, 'pcm-capture-processor'); workletRef.current = processor;
      const silent = ctx.createGain(); silent.gain.value = 0;
      source.connect(processor); processor.connect(silent); silent.connect(ctx.destination);
      let resolveDone = () => {}; doneRef.current = new Promise<void>((resolve) => { resolveDone = resolve; });
      let captured = 0;
      processor.port.onmessage = ({ data }) => {
        if (data.type === 'pcm') {
          const remaining = Math.max(0, ctx.sampleRate * 4 - captured);
          const chunk = (data.samples as Float32Array).subarray(0, remaining); captured += chunk.length;
          if (chunk.length) chunksRef.current.push(chunk);
        } else if (data.type === 'done') resolveDone();
      };
      stream.getAudioTracks().forEach((track) => { track.onended = () => stopRef.current(); });
      processor.onprocessorerror = () => stopRef.current();
      processor.port.postMessage({ type: 'start' });
      const startTime = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime; setElapsedMs(elapsed);
        if (elapsed >= MAX_SAMPLE_MS) stopRef.current();
      }, 100);

      setState('recording');
    } catch (err) {
      releaseDevices();
      releaseRef.current?.(); releaseRef.current = null; setState('idle');
      callbacks.current.onError(err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Microphone access was denied. Allow it in your browser settings, then try again.'
        : 'Could not start recording. Check that no other app is using the microphone.');
    }
  }, []);

  const stop = useCallback(async () => {
    if (!workletRef.current) return;
    clearInterval(timerRef.current);
    const generation = generationRef.current;
    const node = workletRef.current; workletRef.current = null;
    node.port.postMessage({ type: 'stop' });
    if (doneRef.current) await Promise.race([doneRef.current, new Promise<void>((resolve) => setTimeout(resolve, 1500))]);
    node.port.onmessage = null; node.disconnect();
    releaseRef.current?.(); releaseRef.current = null;
    releaseDevices();
    setState('idle');

    if (generation !== generationRef.current) return;

    const totalLen = chunksRef.current.reduce((s, c) => s + c.length, 0);
    if (totalLen < 480) {
      callbacks.current.onError('That recording was too short. Record again and play one clear hit.');
      return;
    }
    const merged = new Float32Array(totalLen);
    let off = 0;
    for (const chunk of chunksRef.current) { merged.set(chunk, off); off += chunk.length; }
    chunksRef.current = [];
    callbacks.current.onCaptured(resample(merged, sampleRateRef.current, 48000));
  }, []);

  stopRef.current = () => { void stop(); };

  const cancel = useCallback(() => {
    generationRef.current++;
    if (workletRef.current) { workletRef.current.port.onmessage = null; workletRef.current.disconnect(); workletRef.current = null; }
    releaseRef.current?.(); releaseRef.current = null;
    clearInterval(timerRef.current);
    releaseDevices();
    chunksRef.current = [];
    setState('idle');
  }, []);

  useEffect(() => cancel, [cancel]);

  return { state, elapsedMs, start, stop, cancel };
}
