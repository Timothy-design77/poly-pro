import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';

/**
 * Hook that connects the AudioEngine lifecycle to React.
 * Handles start/stop, beat sync for dial animation, and cleanup on unmount.
 */
export function useMetronome() {
  const playing = useMetronomeStore((s) => s.playing);
  const setPlaying = useMetronomeStore((s) => s.setPlaying);
  const setCurrentBeat = useMetronomeStore((s) => s.setCurrentBeat);
  const animFrameRef = useRef<number>(0);

  // Subscribe to beat events from the engine
  useEffect(() => {
    const unsubscribe = audioEngine.onBeat((event) => {
      setCurrentBeat(event.beatIndex, event.time);
    });
    return unsubscribe;
  }, [setCurrentBeat]);

  // Start/stop engine when playing state changes
  useEffect(() => {
    if (playing) {
      audioEngine.start().catch((err) => {
        console.error('Failed to start audio engine:', err);
        setPlaying(false);
      });
    } else {
      audioEngine.stop();
    }
  }, [playing, setPlaying]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const togglePlay = useCallback(() => {
    setPlaying(!useMetronomeStore.getState().playing);
  }, [setPlaying]);

  return { togglePlay };
}
