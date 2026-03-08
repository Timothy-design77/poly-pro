import { create } from 'zustand';
import type { SettingsState } from './types';
import { VolumeState } from '../audio/types';
import { DEFAULT_CLICK_SOUND, DEFAULT_ACCENT_SOUND } from '../utils/constants';
import { DETECTION_PRESETS } from '../analysis/types';

export const useSettingsStore = create<SettingsState>((set) => ({
  // Sound
  clickSound: DEFAULT_CLICK_SOUND,
  accentSound: DEFAULT_ACCENT_SOUND,
  accentSoundThreshold: VolumeState.LOUD,

  // Vibration
  hapticEnabled: true,
  vibrationIntensity: 0.5,

  // Detection — defaults match "Standard" preset
  sensitivity: 0.5,
  scoringWindowPct: 5,
  flamMergePct: 45,
  noiseGate: 0.01,
  accentThreshold: 1.5,
  highPassHz: 0,
  detectionPreset: 'Standard',

  // Calibration
  latencyOffset: 0,

  // ─── Actions ───

  setClickSound: (id) => set({ clickSound: id }),
  setAccentSound: (id) => set({ accentSound: id }),
  setAccentSoundThreshold: (level) => set({ accentSoundThreshold: level }),
  setHapticEnabled: (enabled) => set({ hapticEnabled: enabled }),
  setVibrationIntensity: (intensity) =>
    set({ vibrationIntensity: Math.max(0, Math.min(1, intensity)) }),
  setLatencyOffset: (offset) => set({ latencyOffset: offset }),
  setSensitivity: (value) => set({ sensitivity: Math.max(0, Math.min(1, value)) }),

  // Detection setters — changing any slider switches preset to 'Custom'
  setScoringWindowPct: (value) =>
    set({ scoringWindowPct: value, detectionPreset: 'Custom' }),
  setFlamMergePct: (value) =>
    set({ flamMergePct: value, detectionPreset: 'Custom' }),
  setNoiseGate: (value) =>
    set({ noiseGate: value, detectionPreset: 'Custom' }),
  setAccentThreshold: (value) =>
    set({ accentThreshold: value, detectionPreset: 'Custom' }),
  setHighPassHz: (value) =>
    set({ highPassHz: value, detectionPreset: 'Custom' }),

  // Preset: fills all sliders from the chosen preset
  setDetectionPreset: (name) => {
    const preset = DETECTION_PRESETS.find((p) => p.name === name);
    if (preset) {
      set({
        detectionPreset: name,
        scoringWindowPct: preset.scoringWindowPct,
        flamMergePct: preset.flamMergePct,
        noiseGate: preset.noiseGate,
        highPassHz: preset.highPassHz,
      });
    }
  },

  resetToDefaults: () => set({
    clickSound: DEFAULT_CLICK_SOUND,
    accentSound: DEFAULT_ACCENT_SOUND,
    accentSoundThreshold: VolumeState.LOUD,
    hapticEnabled: true,
    vibrationIntensity: 0.5,
    scoringWindowPct: 5,
    flamMergePct: 45,
    noiseGate: 0.01,
    accentThreshold: 1.5,
    highPassHz: 0,
    detectionPreset: 'Standard',
  }),
}));
