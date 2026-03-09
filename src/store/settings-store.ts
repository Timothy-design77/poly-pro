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
  calibratedOffset: 0,
  manualAdjustment: 0,
  lastCalibratedAt: null,
  calibrationConsistency: null,

  // Recording
  includeClickInRecording: true,
  clickVolumeInRecording: 0.15,
  liveWaveform: true,
  audioAfterAnalysis: 'compress' as const,
  rawPcmRetentionDays: 30,

  // ─── Actions ───

  setClickSound: (id) => set({ clickSound: id }),
  setAccentSound: (id) => set({ accentSound: id }),
  setAccentSoundThreshold: (level) => set({ accentSoundThreshold: level }),
  setHapticEnabled: (enabled) => set({ hapticEnabled: enabled }),
  setVibrationIntensity: (intensity) =>
    set({ vibrationIntensity: Math.max(0, Math.min(1, intensity)) }),
  setCalibratedOffset: (offset) => set({ calibratedOffset: offset }),
  setManualAdjustment: (adj) => set({ manualAdjustment: Math.max(-50, Math.min(50, adj)) }),
  setLastCalibratedAt: (date) => set({ lastCalibratedAt: date }),
  setCalibrationConsistency: (value) => set({ calibrationConsistency: value }),
  setSensitivity: (value) => set({ sensitivity: Math.max(0, Math.min(1, value)) }),
  setIncludeClickInRecording: (value) => set({ includeClickInRecording: value }),
  setClickVolumeInRecording: (value) => set({ clickVolumeInRecording: Math.max(0, Math.min(0.5, value)) }),
  setLiveWaveform: (value) => set({ liveWaveform: value }),
  setAudioAfterAnalysis: (value) => set({ audioAfterAnalysis: value }),
  setRawPcmRetentionDays: (value) => set({ rawPcmRetentionDays: value }),

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
    includeClickInRecording: true,
    clickVolumeInRecording: 0.15,
    liveWaveform: true,
    audioAfterAnalysis: 'compress' as const,
    rawPcmRetentionDays: 30,
  }),
}));
