import { useRef, useCallback, useState, useEffect } from 'react';
import { audioEngine } from '../audio';
import { useMetronomeStore } from '../store/metronome-store';
import { createPlaybackLimiter, recordingPlaybackGain } from '../audio/recording-playback';
import { beginCriticalActivity, isCriticalActivityActive } from '../utils/critical-activity';
import * as db from '../store/db';

/** Plays saved session recordings with bounded makeup gain and a safety limiter. */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epochRef = useRef(0);
  const releaseRef = useRef<(() => void) | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const stopCurrent = useCallback(() => {
    epochRef.current++;
    releaseRef.current?.(); releaseRef.current = null;
    if (sourceRef.current) {
      sourceRef.current.onended = null;
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

  useEffect(() => {
    window.addEventListener('polypro:navigation', stopCurrent);
    return () => { window.removeEventListener('polypro:navigation', stopCurrent); stopCurrent(); };
  }, [stopCurrent]);

  const playBlob = useCallback(async (blob: Blob, sessionId: string, isCompressed: boolean, epoch: number) => {
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

      if (epoch !== epochRef.current) return;
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
      if (epoch === epochRef.current) { stopCurrent(); setError(error instanceof Error ? error.message : 'Playback failed.'); }
    }
  }, [stopCurrent]);

  const play = useCallback(async (sessionId: string) => {
    if (playingSessionId === sessionId) {
      stopCurrent();
      return;
    }
    stopCurrent();

    setError(null);
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation first.'); return; }
    const epoch = epochRef.current;
    audioEngine.stop(); useMetronomeStore.getState().setPlaying(false);
    releaseRef.current = beginCriticalActivity('playback');
    try {
      const blob = await db.getRecording(sessionId) ?? await db.getRecording(sessionId + '-playback');
      if (epoch !== epochRef.current) return;
      if (!blob?.size) throw new Error('Recording audio is unavailable. Restore a full backup to play this take.');
      await playBlob(blob, sessionId, blob.type.startsWith('audio/'), epoch);
    } catch (error) { if (epoch === epochRef.current) { stopCurrent(); setError(error instanceof Error ? error.message : 'Could not load audio.'); } }

  }, [playingSessionId, stopCurrent, playBlob]);

  return { error, playingSessionId, play, stop: stopCurrent };
}
