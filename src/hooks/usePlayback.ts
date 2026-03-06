import { useRef, useState, useCallback } from 'react';
import { audioEngine } from '../audio/engine';
import * as db from '../store/db';

/**
 * Plays back raw float32 PCM recordings from IDB via Web Audio.
 * The blob contains raw Float32Array bytes (application/octet-stream).
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const play = useCallback(async (sessionId: string) => {
    // Stop any current playback
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }

    if (playingSessionId === sessionId) {
      setPlayingSessionId(null);
      return; // Toggle off
    }

    const blob = await db.getRecording(sessionId);
    if (!blob) {
      console.warn('No recording found for session', sessionId);
      return;
    }

    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await blob.arrayBuffer();

      // Raw bytes → Float32Array
      const float32 = new Float32Array(arrayBuffer);

      if (float32.length === 0) {
        console.warn('Empty recording');
        return;
      }

      // Create AudioBuffer from raw PCM (mono, 48kHz)
      const audioBuffer = ctx.createBuffer(1, float32.length, 48000);
      audioBuffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      source.onended = () => {
        setPlayingSessionId(null);
        sourceRef.current = null;
      };

      source.start();
      sourceRef.current = source;
      setPlayingSessionId(sessionId);
    } catch (err) {
      console.error('Playback failed:', err);
      setPlayingSessionId(null);
    }
  }, [playingSessionId]);

  const stop = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    setPlayingSessionId(null);
  }, []);

  return { playingSessionId, play, stop };
}
