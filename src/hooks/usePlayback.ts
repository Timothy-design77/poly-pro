import { useRef, useState, useCallback } from 'react';
import * as db from '../store/db';

/**
 * Plays back recordings from IDB.
 * Uses the compressed playback blob (WebM/Opus) via HTML Audio element
 * for proper volume handling through the media audio channel.
 */
export function usePlayback() {
  const [playingSessionId, setPlayingSessionId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const play = useCallback(async (sessionId: string) => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }

    if (playingSessionId === sessionId) {
      setPlayingSessionId(null);
      return; // Toggle off
    }

    // Try compressed playback blob first, fall back to PCM blob
    let blob = await db.getRecording(sessionId + '-playback');
    if (!blob) {
      blob = await db.getRecording(sessionId);
    }
    if (!blob) {
      console.warn('No recording found for session', sessionId);
      return;
    }

    try {
      // Use HTML Audio element — plays through media channel at full volume
      // (Web Audio API plays through a potentially different audio session)
      const url = URL.createObjectURL(blob);
      urlRef.current = url;

      const audio = new Audio(url);
      audio.volume = 1.0;
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingSessionId(null);
        if (urlRef.current) {
          URL.revokeObjectURL(urlRef.current);
          urlRef.current = null;
        }
        audioRef.current = null;
      };

      audio.onerror = () => {
        console.error('Playback error');
        setPlayingSessionId(null);
      };

      await audio.play();
      setPlayingSessionId(sessionId);
    } catch (err) {
      console.error('Playback failed:', err);
      setPlayingSessionId(null);
    }
  }, [playingSessionId]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPlayingSessionId(null);
  }, []);

  return { playingSessionId, play, stop };
}
