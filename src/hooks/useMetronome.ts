import { useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '../audio/engine';
import { useMetronomeStore } from '../store/metronome-store';

/**
 * Hook that connects the AudioEngine lifecycle to React.
 *
 * CRITICAL LATENCY OPTIMIZATION:
 * togglePlay() calls audioEngine.startSync() DIRECTLY in the click handler
 * before React even begins its re-render cycle. This means:
 *   click → startSync() → schedule() → first beat queued
 * ...all in the same call stack, zero frames of delay.
 *
 * The setPlaying() call updates the UI afterward (button text, dial, etc.)
 * but the audio has already started.
 */
export function useMetronome() {
  const setPlaying = useMetronomeStore((s) => s.setPlaying);
  const setCurrentBeat = useMetronomeStore((s) => s.setCurrentBeat);
  const animFrameRef = useRef<number>(0);

  // Subscribe to beat events from the engine
  useEffect(() => {
    const unsubscribe = audioEngine.onBeat((event) => {
      setCurrentBeat(event.trackId, event.beatIndex);
    });
    return unsubscribe;
  }, [setCurrentBeat]);

  // Fallback: if playing state is true but engine isn't running
  // (e.g. context wasn't warm when togglePlay was called)
  const playing = useMetronomeStore((s) => s.playing);
  useEffect(() => {
    if (playing && !audioEngine.running) {
      audioEngine.start().catch((err) => {
        console.error('Failed to start audio engine:', err);
        setPlaying(false);
      });
    } else if (!playing && audioEngine.running) {
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
    const isPlaying = useMetronomeStore.getState().playing;

    if (!isPlaying) {
      // START: fire engine FIRST (sync, in this call stack), then update UI
      const started = audioEngine.startSync();
      setPlaying(true);
      // If sync start failed (context not warm), the useEffect fallback kicks in
      if (!started) {
        audioEngine.start().catch((err) => {
          console.error('Failed to start audio engine:', err);
          setPlaying(false);
        });
      }
    } else {
      // STOP: stop engine, update UI
      audioEngine.stop();
      setPlaying(false);
    }
  }, [setPlaying]);

  return { togglePlay };
}
