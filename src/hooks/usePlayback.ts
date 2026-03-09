import { useRef, useState, useCallback } from 'react';
import { audioEngine } from '../audio/engine';
import * as db from '../store/db';

/**
 * Plays back session recordings.
 *
 * Primary: raw Float32 PCM blobs from AudioWorklet capture.
 * Backward compat: also handles old compressed Opus/WebM blobs from
 * the MediaRecorder era (stored as sessionId + '-playback').
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const stopCurrent = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    setPlayingSessionId(null);
  }, []);

  const play = useCallback(async (sessionId: string) => {
    // Toggle off if already playing this session
    if (playingSessionId === sessionId) {
      stopCurrent();
      return;
    }

    stopCurrent();

    // Get the recording blob
    const blob = await db.getRecording(sessionId);
    if (!blob || blob.size === 0) {
      console.warn('No recording found for session', sessionId);

      // Try legacy compressed blob
      const legacyBlob = await db.getRecording(sessionId + '-playback');
      if (legacyBlob && legacyBlob.size > 0) {
        await playBlob(legacyBlob, sessionId, true);
        return;
      }
      return;
    }

    await playBlob(blob, sessionId, false);
  }, [playingSessionId, stopCurrent]);

  const playBlob = useCallback(async (blob: Blob, sessionId: string, isCompressed: boolean) => {
    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await blob.arrayBuffer();

      let audioBuffer: AudioBuffer;
      if (isCompressed || blob.type.startsWith('audio/')) {
        // Compressed Opus/WebM — decode
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      } else {
        // Raw Float32 PCM from AudioWorklet
        const float32 = new Float32Array(arrayBuffer);
        if (float32.length === 0) return;
        // Look up actual sample rate (may be downsampled from 48kHz)
        let sampleRate = 48000;
        try {
          const sessions = await db.getAllSessions();
          const session = sessions.find((s) => s.id === sessionId);
          if (session?.recordingSampleRate) sampleRate = session.recordingSampleRate;
        } catch { /* use default */ }
        audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Mic recordings are quiet — boost for playback
      const gain = ctx.createGain();
      gain.gain.value = 4.0;
      gainRef.current = gain;

      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => stopCurrent();
      source.start();
      sourceRef.current = source;
      setPlayingSessionId(sessionId);
    } catch (err) {
      console.error('Playback failed:', err);
      stopCurrent();
    }
  }, [stopCurrent]);

  return { playingSessionId, play, stop: stopCurrent };
}
