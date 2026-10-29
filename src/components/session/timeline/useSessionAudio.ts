/** Prepare visualization off the UI thread, then share the playback buffer's PCM view. */
import { useState, useEffect, useRef } from 'react';
import type { SessionRecord } from '../../../store/db';
import * as db from '../../../store/db';
import type { SpectrogramData } from '../Spectrogram';
import { audioEngine } from '../../../audio';

export interface SessionAudio {
  error: string | null;
  isLoading: boolean;
  isReady: boolean;
  spectrogramData: SpectrogramData | null;
  audioBufferRef: React.MutableRefObject<AudioBuffer | null>;
  rawPcmRef: React.MutableRefObject<Float32Array | null>;
}
export function useSessionAudio(session: SessionRecord): SessionAudio {
  const [error, setError] = useState<string | null>(null);
  const [spectrogramData, setSpectrogramData] = useState<SpectrogramData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rawPcmRef = useRef<Float32Array | null>(null);
  useEffect(() => {
    let cancelled = false;
    const worker = new Worker(new URL('../../../workers/session-audio-worker.ts', import.meta.url), { type: 'module' });
    setIsLoading(true); setIsReady(false); setError(null); setSpectrogramData(null);
    audioBufferRef.current = null; rawPcmRef.current = null;
    const fail = (message: string) => { if (!cancelled) { setError(message); setIsLoading(false); } worker.terminate(); };
    void (async () => {
      try {
        const blob = await db.getRecording(session.id) ?? await db.getRecording(session.id + '-playback');
        if (cancelled) return;
        if (!blob?.size) throw new Error('Recording audio is unavailable. Restore a full backup to play this take.');
        const context = await audioEngine.initContext();
        if (cancelled) return;
        let sampleRate = session.recordingSampleRate ?? 48000;
        let decoded: AudioBuffer | null = null;
        worker.onmessage = ({ data }: MessageEvent<{ pcm: Float32Array; spectrogram: SpectrogramData; error?: string }>) => {
          if (cancelled) return;
          if (data.error) { fail(data.error); return; }
          try {
            const buffer = decoded ?? context.createBuffer(1, data.pcm.length, sampleRate);
            if (!decoded) buffer.getChannelData(0).set(data.pcm);
            audioBufferRef.current = buffer; rawPcmRef.current = buffer.getChannelData(0);
            setSpectrogramData(data.spectrogram); setIsReady(true); setIsLoading(false); worker.terminate();
          } catch (error) { fail(error instanceof Error ? error.message : 'Not enough memory to open this recording.'); }
        };
        worker.onerror = () => fail('Audio preparation failed. Close and reopen the take to retry.');
        if (blob.type.startsWith('audio/')) {
          decoded = await context.decodeAudioData(await blob.arrayBuffer());
          if (cancelled) return;
          sampleRate = decoded.sampleRate;
          const pcm = new Float32Array(decoded.getChannelData(0));
          worker.postMessage({ pcm, sampleRate }, [pcm.buffer]);
        } else worker.postMessage({ blob, sampleRate });
      } catch (error) { fail(error instanceof Error ? error.message : 'Could not load this recording.'); }
    })();
    return () => { cancelled = true; worker.terminate(); audioBufferRef.current = null; rawPcmRef.current = null; };
  }, [session.id, session.recordingSampleRate]);
  return { error, isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef };
}
