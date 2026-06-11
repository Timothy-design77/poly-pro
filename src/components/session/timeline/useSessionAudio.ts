/**
 * useSessionAudio — loads the session recording from IDB, prepares an
 * AudioBuffer for playback, and computes the spectrogram for rendering.
 */

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
    (async () => {
      setIsLoading(true);
      const blob = await db.getRecording(session.id);
      if (!blob || blob.size === 0 || cancelled) {
        setIsLoading(false);
        return;
      }

      const arrayBuffer = await blob.arrayBuffer();
      let pcm: Float32Array;
      let sampleRate = 48000;

      if (blob.type.startsWith('audio/') || blob.type === '') {
        // Handle both raw PCM and compressed formats
        try {
          // Try raw PCM first
          pcm = new Float32Array(arrayBuffer);
          if (pcm.length === 0) {
            setIsLoading(false);
            return;
          }
          // Look up sample rate
          try {
            const sessions = await db.getAllSessions();
            const s = sessions.find((s) => s.id === session.id);
            if (s?.recordingSampleRate) sampleRate = s.recordingSampleRate;
          } catch { /* default */ }
        } catch {
          setIsLoading(false);
          return;
        }
      } else {
        setIsLoading(false);
        return;
      }

      if (cancelled) return;

      // Store raw PCM for playback
      rawPcmRef.current = pcm;

      // Build AudioBuffer for playback
      const { audioEngine } = await import('../../../audio');
      const ctx = await audioEngine.initContext();
      const audioBuf = ctx.createBuffer(1, pcm.length, sampleRate);
      audioBuf.getChannelData(0).set(pcm);
      audioBufferRef.current = audioBuf;
      setIsReady(true);

      // Compute spectrogram (this may take 1-2s on long recordings)
      const specData = computeSpectrogram(pcm, sampleRate);
      if (!cancelled) {
        setSpectrogramData(specData);
        setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [session.id]);

  return { isLoading, isReady, spectrogramData, audioBufferRef, rawPcmRef };
}
