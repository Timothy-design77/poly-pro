import { useRef, useState, useCallback } from 'react';
import { audioEngine } from '../audio/engine';
import * as db from '../store/db';

/**
 * Plays back session recordings.
 * Tries compressed WebM/Opus blob first (full volume, native decode).
 * Falls back to raw PCM via Web Audio if compressed unavailable.
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const urlRef = useRef<string | null>(null);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlayingSessionId(null);
  }, []);

  const play = useCallback(async (sessionId: string) => {
    stopCurrent();

    if (playingSessionId === sessionId) return; // Toggle off

    // Try compressed playback blob first
    const compressedBlob = await db.getRecording(sessionId + '-playback');
    if (compressedBlob && compressedBlob.size > 0) {
      try {
        const url = URL.createObjectURL(compressedBlob);
        urlRef.current = url;
        const audio = new Audio(url);
        audio.volume = 1.0;
        audioRef.current = audio;
        audio.onended = () => stopCurrent();
        audio.onerror = () => {
          console.warn('Compressed playback failed, trying PCM fallback');
          stopCurrent();
          playPCM(sessionId);
        };
        await audio.play();
        setPlayingSessionId(sessionId);
        return;
      } catch {
        stopCurrent();
      }
    }

    // Fall back to PCM blob via Web Audio
    await playPCM(sessionId);
  }, [playingSessionId, stopCurrent]);

  const playPCM = useCallback(async (sessionId: string) => {
    const blob = await db.getRecording(sessionId);
    if (!blob || blob.size === 0) {
      console.warn('No recording found');
      return;
    }

    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await blob.arrayBuffer();

      // Try decoding as compressed audio first (older sessions)
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        // Raw float32 PCM
        const float32 = new Float32Array(arrayBuffer);
        if (float32.length === 0) return;
        audioBuffer = ctx.createBuffer(1, float32.length, 48000);
        audioBuffer.getChannelData(0).set(float32);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => stopCurrent();
      source.start();
      sourceRef.current = source;
      setPlayingSessionId(sessionId);
    } catch (err) {
      console.error('PCM playback failed:', err);
      stopCurrent();
    }
  }, [stopCurrent]);

  return { playingSessionId, play, stop: stopCurrent };
}
