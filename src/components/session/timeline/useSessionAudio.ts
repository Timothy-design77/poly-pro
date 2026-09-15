/** Loads stored session audio, builds playback buffer, and computes spectrogram. */
import { useState, useEffect, useRef } from 'react';
import type { SessionRecord } from '../../../store/db';
import * as db from '../../../store/db';
import { computeSpectrogram } from '../Spectrogram';
import type { SpectrogramData } from '../Spectrogram';

export interface SessionAudio {
  isLoading: boolean;
  isReady: boolean;
  spectrogramData: SpectrogramData | null;
  audioBufferRef: React.MutableRefObject<AudioBuffer | null>;
  rawPcmRef: React.MutableRefObject<Float32Array | null>;
}

export function useSessionAudio(session: SessionRecord): SessionAudio {
  const [spectrogramData, setSpectrogramData] = useState<SpectrogramData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const rawPcmRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setIsReady(false);
    setSpectrogramData(null);
    audioBufferRef.current = null;
    rawPcmRef.current = null;

    (async () => {
      try {
        const blob = await db.getRecording(session.id);
        if (!blob || blob.size === 0 || cancelled) return;
        const arrayBuffer = await blob.arrayBuffer();
        let pcm: Float32Array;
        let sampleRate = session.recordingSampleRate ?? 48000;

        if (blob.type.startsWith('audio/')) {
          const { audioEngine } = await import('../../../audio');
          const ctx = await audioEngine.initContext();
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
          sampleRate = decoded.sampleRate;
          pcm = new Float32Array(decoded.length);
          pcm.set(decoded.getChannelData(0));
        } else {
          pcm = new Float32Array(arrayBuffer);
        }

        if (pcm.length === 0 || cancelled) return;
        rawPcmRef.current = pcm;

        const { audioEngine } = await import('../../../audio');
        const ctx = await audioEngine.initContext();
        const audioBuffer = ctx.createBuffer(1, pcm.length, sampleRate);
        audioBuffer.getChannelData(0).set(pcm);
        audioBufferRef.current = audioBuffer;
        setIsReady(true);

        const specData = computeSpectrogram(pcm, sampleRate);
        if (!cancelled) setSpectrogramData(specData);
      } catch (error) {
        console.error('Failed to prepare session audio:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session.id, session.recordingSampleRate]);

  return { isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef };
}
