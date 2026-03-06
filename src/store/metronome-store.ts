import { create } from 'zustand';
import { VolumeState } from '../audio/types';
import type { MetronomeState } from './types';
import { createDefaultTrack } from './types';
import { clampBpm, getBeatGrouping } from '../utils/timing';
import {
  BPM_DEFAULT,
  DEFAULT_METER_NUMERATOR,
  DEFAULT_METER_DENOMINATOR,
  DEFAULT_SUBDIVISION,
  DEFAULT_VOLUME,
} from '../utils/constants';

export const useMetronomeStore = create<MetronomeState>((set, get) => ({
  // Playback
  playing: false,
  bpm: BPM_DEFAULT,
  meterNumerator: DEFAULT_METER_NUMERATOR,
  meterDenominator: DEFAULT_METER_DENOMINATOR,
  beatGrouping: getBeatGrouping(DEFAULT_METER_NUMERATOR, DEFAULT_METER_DENOMINATOR),
  subdivision: DEFAULT_SUBDIVISION,
  volume: DEFAULT_VOLUME,

  // Tracks
  tracks: [createDefaultTrack(DEFAULT_METER_NUMERATOR, DEFAULT_SUBDIVISION)],

  // Beat animation
  currentBeatIndex: -1,
  currentBeatTime: 0,

  // ─── Actions ───

  setPlaying: (playing) => set({ playing }),

  setBpm: (bpm) => set({ bpm: clampBpm(bpm) }),

  adjustBpm: (delta) => {
    const { bpm } = get();
    set({ bpm: clampBpm(bpm + delta) });
  },

  setMeter: (numerator, denominator) => {
    const grouping = getBeatGrouping(numerator, denominator);
    const { subdivision } = get();
    set({
      meterNumerator: numerator,
      meterDenominator: denominator,
      beatGrouping: grouping,
      tracks: [createDefaultTrack(numerator, subdivision)],
    });
  },

  setSubdivision: (sub) => {
    const { meterNumerator } = get();
    set({
      subdivision: sub,
      tracks: [createDefaultTrack(meterNumerator, sub)],
    });
  },

  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),

  setCurrentBeat: (index, time) => set({ currentBeatIndex: index, currentBeatTime: time }),

  updateTrackAccent: (trackId, beatIndex) => {
    const { tracks } = get();
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const newAccents = [...t.accents];
      // Cycle: OFF → GHOST → SOFT → MED → LOUD → ACCENT → OFF
      const current = newAccents[beatIndex];
      const next = current >= VolumeState.ACCENT ? VolumeState.OFF : (current + 1) as VolumeState;
      newAccents[beatIndex] = next;
      return { ...t, accents: newAccents };
    });
    set({ tracks: updated });
  },

  resetToDefaults: () => {
    set({
      playing: false,
      bpm: BPM_DEFAULT,
      meterNumerator: DEFAULT_METER_NUMERATOR,
      meterDenominator: DEFAULT_METER_DENOMINATOR,
      beatGrouping: getBeatGrouping(DEFAULT_METER_NUMERATOR, DEFAULT_METER_DENOMINATOR),
      subdivision: DEFAULT_SUBDIVISION,
      volume: DEFAULT_VOLUME,
      tracks: [createDefaultTrack(DEFAULT_METER_NUMERATOR, DEFAULT_SUBDIVISION)],
      currentBeatIndex: -1,
      currentBeatTime: 0,
    });
  },
}));
