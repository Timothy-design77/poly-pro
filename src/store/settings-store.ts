import { create } from 'zustand';
import type { SettingsState } from './types';
import { VolumeState } from '../audio/types';
import { DEFAULT_CLICK_SOUND, DEFAULT_ACCENT_SOUND } from '../utils/constants';

export const useSettingsStore = create<SettingsState>((set) => ({
  // Sound
  clickSound: DEFAULT_CLICK_SOUND,
  accentSound: DEFAULT_ACCENT_SOUND,
  clickVolume: 0.8,
  accentSoundThreshold: VolumeState.LOUD, // accent sound plays at this level and above

  // Vibration
  hapticEnabled: true,
  vibrationIntensity: 0.5,

  // Detection (stubs — wired in Phase 5)
  sensitivity: 0.5,
  scoringWindow: 0.05,
  flamMergeWindow: 0.45,
  accentThreshold: 1.5,
  noiseFloor: 0.05,

  // Calibration
  latencyOffset: 0,

  // Recording
  recordingClickVolume: 0.15,
  includeClickInRecording: true,

  // ─── Actions ───

  setClickSound: (id) => set({ clickSound: id }),
  setAccentSound: (id) => set({ accentSound: id }),
  setClickVolume: (vol) => set({ clickVolume: Math.max(0, Math.min(1, vol)) }),
  setAccentSoundThreshold: (level) => set({ accentSoundThreshold: level }),
  setHapticEnabled: (enabled) => set({ hapticEnabled: enabled }),
  setVibrationIntensity: (intensity) =>
    set({ vibrationIntensity: Math.max(0, Math.min(1, intensity)) }),
  setLatencyOffset: (offset) => set({ latencyOffset: offset }),

  resetToDefaults: () => set({
    clickSound: DEFAULT_CLICK_SOUND,
    accentSound: DEFAULT_ACCENT_SOUND,
    clickVolume: 0.8,
    accentSoundThreshold: VolumeState.LOUD,
    hapticEnabled: true,
    vibrationIntensity: 0.5,
  }),
}));
