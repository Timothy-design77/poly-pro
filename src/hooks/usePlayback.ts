import { useRef, useState, useCallback } from 'react';
import { audioEngine } from '../audio/engine';
import * as db from '../store/db';

/**
 * Plays back session recordings.
 * Tries compressed WebM/Opus blob first via HTML Audio element.
 * Falls back to raw PCM via Web Audio with gain boost.
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const urlRef = useRef<string | null>(null);

  const stopCurrent = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlayingSessionId(null);
  }, []);

  const playPCM = useCallback(async (sessionId: string): Promise<boolean> => {
    // Try the main recording blob (may be decoded PCM or compressed fallback)
    const blob = await db.getRecording(sessionId);
    if (!blob || blob.size === 0) return false;

    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await blob.arrayBuffer();

      let audioBuffer: AudioBuffer;
      try {
        // Try decoding as compressed audio first (if PCM decode failed during save)
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        // Raw float32 PCM — wrap in AudioBuffer
        const float32 = new Float32Array(arrayBuffer);
        if (float32.length === 0) return false;
        audioBuffer = ctx.createBuffer(1, float32.length, 48000);
        audioBuffer.getChannelData(0).set(float32);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Apply gain boost — raw mic recordings are quiet, need amplification
      const gain = ctx.createGain();
      gain.gain.value = 4.0; // Boost mic recordings to audible level
      gainRef.current = gain;

      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => stopCurrent();
      source.start();
      sourceRef.current = source;
      setPlayingSessionId(sessionId);
      return true;
    } catch (err) {
      console.error('PCM playback failed:', err);
      return false;
    }
  }, [stopCurrent]);

  const play = useCallback(async (sessionId: string) => {
    // Toggle off if already playing this session
    if (playingSessionId === sessionId) {
      stopCurrent();
      return;
    }

    stopCurrent();

    // Try compressed playback blob first (HTML Audio — handles Opus/WebM natively)
    const compressedBlob = await db.getRecording(sessionId + '-playback');
    if (compressedBlob && compressedBlob.size > 0) {
      try {
        const url = URL.createObjectURL(compressedBlob);
        urlRef.current = url;
        const audio = new Audio(url);
        audio.volume = 1.0;
        audioRef.current = audio;

        // Set up event handlers BEFORE calling play
        const playPromise = new Promise<boolean>((resolve) => {
          audio.oncanplaythrough = () => resolve(true);
          audio.onerror = () => resolve(false);
          // Timeout — if nothing happens in 2s, try fallback
          setTimeout(() => resolve(false), 2000);
        });

        audio.load(); // Explicitly load to trigger canplaythrough

        const canPlay = await playPromise;
        if (canPlay) {
          audio.onended = () => stopCurrent();
          audio.onerror = () => stopCurrent();
          await audio.play();
          setPlayingSessionId(sessionId);
          return;
        }
      } catch {
        // Fall through to PCM
      }
      // Clean up failed compressed attempt
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      audioRef.current = null;
    }

    // Fall back to PCM blob via Web Audio (with gain boost)
    const ok = await playPCM(sessionId);
    if (!ok) {
      console.warn('No playable recording found for session', sessionId);
    }
  }, [playingSessionId, stopCurrent, playPCM]);

  return { playingSessionId, play, stop: stopCurrent };
}
