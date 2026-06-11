/**
 * Persisted state shapes — single source of truth.
 *
 * Previously the same field lists were hand-maintained in three places
 * (persistence.ts pick functions, db.ts MetronomeSnapshot, project-store
 * captureSnapshot), which let them drift (e.g. the deprecated clickVolume
 * field). Here each shape is DERIVED from the store state types via key
 * arrays, so adding a field to persistence is a one-line change and the
 * compiler enforces that keys actually exist on the store state.
 */

import type { MetronomeState, SettingsState } from './types';

// ─── Key lists (checked against store types at compile time) ───

export const PERSISTED_METRONOME_KEYS = [
  'bpm',
  'meterNumerator',
  'meterDenominator',
  'beatGrouping',
  'subdivision',
  'volume',
  'swing',
  'trainerEnabled',
  'trainerStartBpm',
  'trainerEndBpm',
  'trainerBpmStep',
  'trainerBarsPerStep',
  'countInBars',
  'gapClickEnabled',
  'gapClickProbability',
  'randomMuteEnabled',
  'randomMuteProbability',
  'playMuteCycleEnabled',
  'playMuteCyclePlayBars',
  'playMuteCycleMuteBars',
] as const satisfies readonly (keyof MetronomeState)[];

export const PERSISTED_SETTINGS_KEYS = [
  'clickSound',
  'accentSound',
  'accentSoundThreshold',
  'hapticEnabled',
  'swipeNavEnabled',
  'vibrationIntensity',
  'calibratedOffset',
  'manualAdjustment',
  'sensitivity',
  'scoringWindowPct',
  'flamMergePct',
  'noiseGate',
  'accentThreshold',
  'highPassHz',
  'detectionPreset',
  'lastCalibratedAt',
  'calibrationConsistency',
] as const satisfies readonly (keyof SettingsState)[];

/** Settings subset captured into per-project snapshots. */
export const SNAPSHOT_SETTINGS_KEYS = [
  'clickSound',
  'accentSound',
  'accentSoundThreshold',
  'hapticEnabled',
  'vibrationIntensity',
] as const satisfies readonly (keyof SettingsState)[];

// ─── Derived types ───

type MetronomeKey = (typeof PERSISTED_METRONOME_KEYS)[number];
type SettingsKey = (typeof PERSISTED_SETTINGS_KEYS)[number];
type SnapshotSettingsKey = (typeof SNAPSHOT_SETTINGS_KEYS)[number];

export interface PersistedMetronome extends Pick<MetronomeState, MetronomeKey> {
  /** Bumped when the persisted shape changes — see migrations.ts */
  _schemaVersion?: number;
}

export type PersistedSettings = Pick<SettingsState, SettingsKey>;

/**
 * Full metronome + settings snapshot stored on each project.
 * Includes tracks (which the global persisted metronome state does not —
 * track-0 is rebuilt from meter/subdivision on global hydrate).
 */
export interface MetronomeSnapshot
  extends Pick<MetronomeState, MetronomeKey>,
    Pick<SettingsState, SnapshotSettingsKey> {
  tracks: MetronomeState['tracks'];
  /** DEPRECATED — kept optional for IDB backward compat. */
  clickVolume?: number;
}

// ─── Pickers ───

function pickKeys<T extends object, K extends readonly (keyof T)[]>(
  source: T,
  keys: K,
): Pick<T, K[number]> {
  const out = {} as Pick<T, K[number]>;
  for (const k of keys) out[k] = source[k];
  return out;
}

export function pickPersistedMetronome(state: MetronomeState): Pick<MetronomeState, MetronomeKey> {
  return pickKeys(state, PERSISTED_METRONOME_KEYS);
}

export function pickPersistedSettings(state: SettingsState): PersistedSettings {
  return pickKeys(state, PERSISTED_SETTINGS_KEYS);
}

export function captureSnapshot(m: MetronomeState, s: SettingsState): MetronomeSnapshot {
  return {
    ...pickKeys(m, PERSISTED_METRONOME_KEYS),
    ...pickKeys(s, SNAPSHOT_SETTINGS_KEYS),
    tracks: m.tracks,
  };
}
