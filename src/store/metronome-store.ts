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
  currentBeats: {},

  // Trainer
  trainerEnabled: false,
  trainerStartBpm: 80,
  trainerEndBpm: 140,
  trainerBpmStep: 5,
  trainerBarsPerStep: 4,

  // Count-in
  countInBars: 0,

  // Practice modes
  gapClickEnabled: false,
  gapClickProbability: 0.3,
  randomMuteEnabled: false,
  randomMuteProbability: 0.25,

  // Swing
  swing: 0,

  // ─── Actions ───

  setPlaying: (playing) => set({ playing }),

  setBpm: (bpm) => set({ bpm: clampBpm(bpm) }),

  adjustBpm: (delta) => {
    const { bpm } = get();
    set({ bpm: clampBpm(bpm + delta) });
  },

  setMeter: (numerator, denominator) => {
    const grouping = getBeatGrouping(numerator, denominator);
    const { subdivision, tracks } = get();
    // Rebuild track 0 but keep extra polyrhythm tracks
    const newTrack0 = createDefaultTrack(numerator, subdivision, 'track-0');
    const extraTracks = tracks.filter(t => t.id !== 'track-0');
    set({
      meterNumerator: numerator,
      meterDenominator: denominator,
      beatGrouping: grouping,
      tracks: [newTrack0, ...extraTracks],
    });
  },

  setSubdivision: (sub) => {
    const { meterNumerator, tracks } = get();
    const newTrack0 = createDefaultTrack(meterNumerator, sub, 'track-0');
    const extraTracks = tracks.filter(t => t.id !== 'track-0');
    set({
      subdivision: sub,
      tracks: [newTrack0, ...extraTracks],
    });
  },

  setVolume: (vol) => set({ volume: Math.max(0, Math.min(1, vol)) }),

  setSwing: (swing) => set({ swing: Math.max(0, Math.min(1, swing)) }),

  setCurrentBeat: (trackId, index) => {
    const { currentBeats } = get();
    set({ currentBeats: { ...currentBeats, [trackId]: index } });
  },

  updateTrackAccent: (trackId, beatIndex) => {
    const { tracks } = get();
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const newAccents = [...t.accents];
      const current = newAccents[beatIndex];
      const next = current >= VolumeState.ACCENT ? VolumeState.OFF : (current + 1) as VolumeState;
      newAccents[beatIndex] = next;
      return { ...t, accents: newAccents };
    });
    set({ tracks: updated });
  },

  setTrackSound: (trackId, soundId, isAccent) => {
    const { tracks } = get();
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      return isAccent ? { ...t, accentSound: soundId } : { ...t, normalSound: soundId };
    });
    set({ tracks: updated });
  },

  setTrackMuted: (trackId, muted) => {
    const { tracks } = get();
    set({ tracks: tracks.map(t => t.id === trackId ? { ...t, muted } : t) });
  },

  setTrackSwing: (trackId, swing) => {
    const { tracks } = get();
    set({ tracks: tracks.map(t => t.id === trackId ? { ...t, swing: Math.max(0, Math.min(1, swing)) } : t) });
  },

  setBeatSound: (trackId, beatIndex, soundId) => {
    const { tracks } = get();
    const updated = tracks.map((t) => {
      if (t.id !== trackId) return t;
      const newOverrides = { ...t.soundOverrides };
      if (soundId === null) {
        delete newOverrides[beatIndex];
      } else {
        newOverrides[beatIndex] = soundId;
      }
      return { ...t, soundOverrides: newOverrides };
    });
    set({ tracks: updated });
  },

  addTrack: (beats) => {
    const { tracks } = get();
    if (tracks.length >= 4) return; // max 4 tracks
    const id = `track-${tracks.length}`;
    const accents: VolumeState[] = [];
    for (let i = 0; i < beats; i++) {
      accents.push(i === 0 ? VolumeState.ACCENT : VolumeState.LOUD);
    }
    const newTrack = {
      id,
      beats,
      accents,
      normalSound: 'clave',
      normalVolume: 1,
      accentSound: 'clave',
      accentVolume: 2,
      muted: false,
      swing: 0,
      soundOverrides: {},
    };
    set({ tracks: [...tracks, newTrack] });
  },

  removeTrack: (trackId) => {
    const { tracks } = get();
    if (tracks.length <= 1) return;
    set({ tracks: tracks.filter(t => t.id !== trackId) });
  },

  setTrainerEnabled: (enabled) => {
    const { bpm } = get();
    set({
      trainerEnabled: enabled,
      ...(enabled ? { trainerStartBpm: bpm } : {}),
    });
  },

  setTrainerConfig: (config) => set(config),

  setCountInBars: (bars) => set({ countInBars: Math.max(0, Math.min(8, bars)) }),

  setGapClick: (enabled, probability) => set({
    gapClickEnabled: enabled,
    ...(probability !== undefined ? { gapClickProbability: probability } : {}),
  }),

  setRandomMute: (enabled, probability) => set({
    randomMuteEnabled: enabled,
    ...(probability !== undefined ? { randomMuteProbability: probability } : {}),
  }),

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
      currentBeats: {},
      trainerEnabled: false,
      countInBars: 0,
      gapClickEnabled: false,
      randomMuteEnabled: false,
      swing: 0,
    });
  },
}));
