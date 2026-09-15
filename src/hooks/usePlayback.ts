import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio';
import { useMetronomeStore } from '../store/metronome-store';
import { createPlaybackLimiter, recordingPlaybackGain } from '../audio/recording-playback';
import * as db from '../store/db';

/** Plays saved session recordings with bounded makeup gain and a safety limiter. */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const stopCurrent = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch {}
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }
    if (gainRef.current) {
      try { gainRef.current.disconnect(); } catch {}
      gainRef.current = null;
    }
    if (limiterRef.current) {
      try { limiterRef.current.disconnect(); } catch {}
      limiterRef.current = null;
    }
    unsubRef.current?.();
    unsubRef.current = null;
    setPlayingSessionId(null);
  }, []);

  useEffect(() => () => stopCurrent(), [stopCurrent]);

  const playBlob = useCallback(async (blob: Blob, sessionId: string, isCompressed: boolean) => {
    try {
      const ctx = await audioEngine.initContext();
      const arrayBuffer = await blob.arrayBuffer();
      let audioBuffer: AudioBuffer;

      if (isCompressed || blob.type.startsWith('audio/')) {
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
      } else {
        const float32 = new Float32Array(arrayBuffer);
        if (float32.length === 0) return;
        let sampleRate = 48000;
        try {
          const sessions = await db.getAllSessions();
          sampleRate = sessions.find((session) => session.id === sessionId)?.recordingSampleRate ?? sampleRate;
        } catch {}
        audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
        audioBuffer.getChannelData(0).set(float32);
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const gain = ctx.createGain();
      const limiter = createPlaybackLimiter(ctx);
      const volume = useMetronomeStore.getState().volume;
      gain.gain.value = recordingPlaybackGain(volume);

      source.connect(gain);
      gain.connect(limiter);
      limiter.connect(ctx.destination);
      sourceRef.current = source;
      gainRef.current = gain;
      limiterRef.current = limiter;
      source.onended = () => stopCurrent();
      source.start();
      setPlayingSessionId(sessionId);

      unsubRef.current?.();
      let previousVolume = volume;
      unsubRef.current = useMetronomeStore.subscribe((state) => {
        if (state.volume === previousVolume) return;
        previousVolume = state.volume;
        if (gainRef.current) gainRef.current.gain.value = recordingPlaybackGain(state.volume);
      });
    } catch (error) {
      console.error('Playback failed:', error);
      stopCurrent();
    }
  }, [stopCurrent]);

  const play = useCallback(async (sessionId: string) => {
    if (playingSessionId === sessionId) {
      stopCurrent();
      return;
    }
    stopCurrent();

    const blob = await db.getRecording(sessionId);
    if (blob && blob.size > 0) {
      await playBlob(blob, sessionId, false);
      return;
    }

    const legacy = await db.getRecording(sessionId + '-playback');
    if (legacy && legacy.size > 0) await playBlob(legacy, sessionId, true);
  }, [playingSessionId, stopCurrent, playBlob]);

  return { playingSessionId, play, stop: stopCurrent };
}
