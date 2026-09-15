import { useEffect, useRef, useCallback } from 'react';
import { audioEngine } from '../audio';
import { useMetronomeStore } from '../store/metronome-store';

/** Connects the scheduler to UI state while keeping audible timing authoritative. */
export function useMetronome() {
  const setPlaying = useMetronomeStore((s) => s.setPlaying);
  const setCurrentBeat = useMetronomeStore((s) => s.setCurrentBeat);
  const visualTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const unsubscribe = audioEngine.onBeat((event) => {
      const ctx = audioEngine.getContext();
      const delayMs = ctx ? Math.max(0, (event.time - ctx.currentTime) * 1000) : 0;
      if (delayMs <= 1) {
        setCurrentBeat(event.trackId, event.beatIndex);
        return;
      }
      const timer = setTimeout(() => {
        visualTimersRef.current.delete(timer);
        setCurrentBeat(event.trackId, event.beatIndex);
      }, delayMs);
      visualTimersRef.current.add(timer);
    });
    return () => {
      unsubscribe();
      for (const timer of visualTimersRef.current) clearTimeout(timer);
      visualTimersRef.current.clear();
    };
  }, [setCurrentBeat]);

  const playing = useMetronomeStore((s) => s.playing);
  useEffect(() => {
    if (playing && !audioEngine.running) {
      audioEngine.start().catch((error) => {
        console.error('Failed to start audio engine:', error);
        setPlaying(false);
      });
    } else if (!playing && audioEngine.running) {
      audioEngine.stop();
      for (const timer of visualTimersRef.current) clearTimeout(timer);
      visualTimersRef.current.clear();
    }
  }, [playing, setPlaying]);

  const togglePlay = useCallback(() => {
    const isPlaying = useMetronomeStore.getState().playing;
    if (!isPlaying) {
      const started = audioEngine.startSync();
      setPlaying(true);
      if (!started) {
        audioEngine.start().catch((error) => {
          console.error('Failed to start audio engine:', error);
          setPlaying(false);
        });
      }
    } else {
      audioEngine.stop();
      for (const timer of visualTimersRef.current) clearTimeout(timer);
      visualTimersRef.current.clear();
      setPlaying(false);
    }
  }, [setPlaying]);

  return { togglePlay };
}
