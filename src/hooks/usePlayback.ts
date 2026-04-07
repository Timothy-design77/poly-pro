import { useRef, useState, useCallback, useEffect } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';
import { MASTER_GAIN_MULTIPLIER } from '../utils/constants';
import * as db from '../store/db';

/** Same perceptual curve as engine.ts — vol² × multiplier */
function perceptualGain(vol: number): number {
  return vol * vol * MASTER_GAIN_MULTIPLIER;
}

/** Mic boost × user volume = playback gain */
const MIC_BOOST = 4.0;

/**
 * Plays back session recordings.
 *
 * Primary: raw Float32 PCM blobs from AudioWorklet capture.
 * Backward compat: also handles old compressed Opus/WebM blobs from
 * the MediaRecorder era (stored as sessionId + '-playback').
 *
 * Respects the metronome volume slider in real-time.
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // Subscribe to volume changes while playing
  useEffect(() => {
    return () => {
      // Cleanup subscription on unmount
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  const stopCurrent = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    // Unsubscribe from volume changes
    unsubRef.current?.();
    unsubRef.current = null;
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

      // Gain node: mic boost × perceptual volume from slider
      const gain = ctx.createGain();
      const vol = useMetronomeStore.getState().volume;
      gain.gain.value = MIC_BOOST * perceptualGain(vol);
      gainRef.current = gain;

      source.connect(gain);
      gain.connect(ctx.destination);
      source.onended = () => stopCurrent();
      source.start();
      sourceRef.current = source;
      setPlayingSessionId(sessionId);

      // Subscribe to volume slider changes during playback
      unsubRef.current?.();
      let prevVol = vol;
      unsubRef.current = useMetronomeStore.subscribe((state) => {
        if (state.volume !== prevVol) {
          prevVol = state.volume;
          if (gainRef.current) {
            gainRef.current.gain.value = MIC_BOOST * perceptualGain(state.volume);
          }
        }
      });
    } catch (err) {
      console.error('Playback failed:', err);
      stopCurrent();
    }
  }, [stopCurrent]);

  return { playingSessionId, play, stop: stopCurrent };
}
