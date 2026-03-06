/**
 * Persistence layer for metronome and settings stores.
 * - Subscribes to Zustand store changes
 * - Debounce-writes to IndexedDB (500ms)
 * - Hydrates stores from IDB on startup
 */

import { useMetronomeStore } from './metronome-store';
import { useSettingsStore } from './settings-store';
import * as db from './db';

// Keys used in the 'settings' IDB store
const METRONOME_KEY = 'metronome-state';
const SETTINGS_KEY = 'settings-state';

// ─── Metronome state fields to persist ───
// (exclude transient fields like playing, currentBeats, playStartTime, currentBar)

interface PersistedMetronome {
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  beatGrouping: number[];
  subdivision: number;
  volume: number;
  swing: number;
  trainerEnabled: boolean;
  trainerStartBpm: number;
  trainerEndBpm: number;
  trainerBpmStep: number;
  trainerBarsPerStep: number;
  countInBars: number;
  gapClickEnabled: boolean;
  gapClickProbability: number;
  randomMuteEnabled: boolean;
  randomMuteProbability: number;
  playMuteCycleEnabled: boolean;
  playMuteCyclePlayBars: number;
  playMuteCycleMuteBars: number;
}

function pickMetronome(state: ReturnType<typeof useMetronomeStore.getState>): PersistedMetronome {
  return {
    bpm: state.bpm,
    meterNumerator: state.meterNumerator,
    meterDenominator: state.meterDenominator,
    beatGrouping: state.beatGrouping,
    subdivision: state.subdivision,
    volume: state.volume,
    swing: state.swing,
    trainerEnabled: state.trainerEnabled,
    trainerStartBpm: state.trainerStartBpm,
    trainerEndBpm: state.trainerEndBpm,
    trainerBpmStep: state.trainerBpmStep,
    trainerBarsPerStep: state.trainerBarsPerStep,
    countInBars: state.countInBars,
    gapClickEnabled: state.gapClickEnabled,
    gapClickProbability: state.gapClickProbability,
    randomMuteEnabled: state.randomMuteEnabled,
    randomMuteProbability: state.randomMuteProbability,
    playMuteCycleEnabled: state.playMuteCycleEnabled,
    playMuteCyclePlayBars: state.playMuteCyclePlayBars,
    playMuteCycleMuteBars: state.playMuteCycleMuteBars,
  };
}

interface PersistedSettings {
  clickSound: string;
  accentSound: string;
  clickVolume: number;
  accentSoundThreshold: number;
  hapticEnabled: boolean;
  vibrationIntensity: number;
  latencyOffset: number;
  recordingClickVolume: number;
  includeClickInRecording: boolean;
}

function pickSettings(state: ReturnType<typeof useSettingsStore.getState>): PersistedSettings {
  return {
    clickSound: state.clickSound,
    accentSound: state.accentSound,
    clickVolume: state.clickVolume,
    accentSoundThreshold: state.accentSoundThreshold,
    hapticEnabled: state.hapticEnabled,
    vibrationIntensity: state.vibrationIntensity,
    latencyOffset: state.latencyOffset,
    recordingClickVolume: state.recordingClickVolume,
    includeClickInRecording: state.includeClickInRecording,
  };
}

// ─── Debounced writers ───

let metronomeTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;

function saveMetronome() {
  if (metronomeTimer) clearTimeout(metronomeTimer);
  metronomeTimer = setTimeout(() => {
    const data = pickMetronome(useMetronomeStore.getState());
    db.setSetting(METRONOME_KEY, data).catch(console.error);
  }, 500);
}

function saveSettings() {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const data = pickSettings(useSettingsStore.getState());
    db.setSetting(SETTINGS_KEY, data).catch(console.error);
  }, 500);
}

// ─── Hydrate from IDB ───

export async function hydrateStores(): Promise<void> {
  const [metronomeData, settingsData] = await Promise.all([
    db.getSetting<PersistedMetronome>(METRONOME_KEY),
    db.getSetting<PersistedSettings>(SETTINGS_KEY),
  ]);

  if (metronomeData) {
    // Apply persisted state (only the fields we saved — don't touch transient state)
    useMetronomeStore.setState(metronomeData);
    // Rebuild track-0 to match persisted meter/subdivision/grouping
    const { meterNumerator, subdivision, beatGrouping } = metronomeData;
    const { createDefaultTrack } = await import('./types');
    const track0 = createDefaultTrack(meterNumerator, subdivision, 'track-0', beatGrouping);
    useMetronomeStore.setState({ tracks: [track0] });
  }

  if (settingsData) {
    useSettingsStore.setState(settingsData);
  }
}

// ─── Subscribe to changes ───

export function startPersistence(): void {
  // Subscribe fires on every state change — debounced writes handle the rest
  useMetronomeStore.subscribe(saveMetronome);
  useSettingsStore.subscribe(saveSettings);
}
