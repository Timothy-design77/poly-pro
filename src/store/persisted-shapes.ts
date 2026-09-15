/** Persisted state shapes — single source of truth. */
import type { MetronomeState, SettingsState } from './types';

export const PERSISTED_METRONOME_KEYS = [
  'bpm', 'meterNumerator', 'meterDenominator', 'beatGrouping', 'subdivision',
  'volume', 'swing', 'tracks', 'trainerEnabled', 'trainerStartBpm', 'trainerEndBpm',
  'trainerBpmStep', 'trainerBarsPerStep', 'countInBars', 'gapClickEnabled',
  'gapClickProbability', 'randomMuteEnabled', 'randomMuteProbability',
  'playMuteCycleEnabled', 'playMuteCyclePlayBars', 'playMuteCycleMuteBars',
] as const satisfies readonly (keyof MetronomeState)[];

export const PERSISTED_SETTINGS_KEYS = [
  'clickSound', 'accentSound', 'accentSoundThreshold', 'hapticEnabled', 'vibrationIntensity',
  'calibratedOffset', 'manualAdjustment', 'sensitivity', 'scoringWindowPct', 'flamMergePct',
  'noiseGate', 'accentThreshold', 'highPassHz', 'detectionPreset', 'noiseFloorMultiplier',
  'minOnsetIntervalMs', 'postHitMaskingMs', 'postHitMaskingStrength', 'fluxThresholdOffset',
  'lastCalibratedAt', 'calibrationConsistency', 'includeClickInRecording', 'clickVolumeInRecording',
  'liveWaveform', 'audioAfterAnalysis', 'rawPcmRetentionDays',
] as const satisfies readonly (keyof SettingsState)[];

export const SNAPSHOT_SETTINGS_KEYS = [
  'clickSound', 'accentSound', 'accentSoundThreshold', 'hapticEnabled', 'vibrationIntensity',
] as const satisfies readonly (keyof SettingsState)[];

type MetronomeKey = (typeof PERSISTED_METRONOME_KEYS)[number];
type SettingsKey = (typeof PERSISTED_SETTINGS_KEYS)[number];
type SnapshotSettingsKey = (typeof SNAPSHOT_SETTINGS_KEYS)[number];

export interface PersistedMetronome extends Pick<MetronomeState, MetronomeKey> { _schemaVersion?: number; }
export type PersistedSettings = Pick<SettingsState, SettingsKey>;
export interface MetronomeSnapshot extends Pick<MetronomeState, MetronomeKey>, Pick<SettingsState, SnapshotSettingsKey> { clickVolume?: number; }

function pickKeys<T extends object, K extends readonly (keyof T)[]>(source: T, keys: K): Pick<T, K[number]> {
  const out = {} as Pick<T, K[number]>;
  for (const key of keys) out[key] = source[key];
  return out;
}

export function pickPersistedMetronome(state: MetronomeState): Pick<MetronomeState, MetronomeKey> { return pickKeys(state, PERSISTED_METRONOME_KEYS); }
export function pickPersistedSettings(state: SettingsState): PersistedSettings { return pickKeys(state, PERSISTED_SETTINGS_KEYS); }
export function captureSnapshot(metronome: MetronomeState, settings: SettingsState): MetronomeSnapshot {
  return { ...pickKeys(metronome, PERSISTED_METRONOME_KEYS), ...pickKeys(settings, SNAPSHOT_SETTINGS_KEYS) };
}
