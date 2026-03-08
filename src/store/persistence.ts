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
  _schemaVersion?: number; // Added in v2 — used to detect stale data from broken audio era
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

// Current schema version — bump when persisted shape changes
const SCHEMA_VERSION = 2;

function pickMetronome(state: ReturnType<typeof useMetronomeStore.getState>): PersistedMetronome {
  return {
    _schemaVersion: SCHEMA_VERSION,
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
  accentSoundThreshold: number;
  hapticEnabled: boolean;
  vibrationIntensity: number;
  latencyOffset: number;
  sensitivity: number;
}

function pickSettings(state: ReturnType<typeof useSettingsStore.getState>): PersistedSettings {
  return {
    clickSound: state.clickSound,
    accentSound: state.accentSound,
    accentSoundThreshold: state.accentSoundThreshold,
    hapticEnabled: state.hapticEnabled,
    vibrationIntensity: state.vibrationIntensity,
    latencyOffset: state.latencyOffset,
    sensitivity: state.sensitivity,
  };
}

// ─── Debounced writers ───

let metronomeTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

function saveMetronome() {
  if (metronomeTimer) clearTimeout(metronomeTimer);
  metronomeTimer = setTimeout(() => {
    const data = pickMetronome(useMetronomeStore.getState());
    db.setSetting(METRONOME_KEY, data).catch(console.error);
  }, 500);
  // Also save snapshot to active project
  saveActiveProjectSnapshot();
}

function saveSettings() {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const data = pickSettings(useSettingsStore.getState());
    db.setSetting(SETTINGS_KEY, data).catch(console.error);
  }, 500);
  // Also save snapshot to active project
  saveActiveProjectSnapshot();
}

/** Debounced save of full snapshot to the active project in IDB */
function saveActiveProjectSnapshot() {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(async () => {
    // Lazy import to avoid circular dependency
    const { useProjectStore } = await import('./project-store');
    const { projects, activeProjectId } = useProjectStore.getState();
    if (!activeProjectId) return;

    const project = projects.find((p) => p.id === activeProjectId);
    if (!project) return;

    const m = useMetronomeStore.getState();
    const s = useSettingsStore.getState();
    const snapshot = {
      bpm: m.bpm,
      meterNumerator: m.meterNumerator,
      meterDenominator: m.meterDenominator,
      beatGrouping: m.beatGrouping,
      subdivision: m.subdivision,
      volume: m.volume,
      swing: m.swing,
      tracks: m.tracks,
      trainerEnabled: m.trainerEnabled,
      trainerStartBpm: m.trainerStartBpm,
      trainerEndBpm: m.trainerEndBpm,
      trainerBpmStep: m.trainerBpmStep,
      trainerBarsPerStep: m.trainerBarsPerStep,
      countInBars: m.countInBars,
      gapClickEnabled: m.gapClickEnabled,
      gapClickProbability: m.gapClickProbability,
      randomMuteEnabled: m.randomMuteEnabled,
      randomMuteProbability: m.randomMuteProbability,
      playMuteCycleEnabled: m.playMuteCycleEnabled,
      playMuteCyclePlayBars: m.playMuteCyclePlayBars,
      playMuteCycleMuteBars: m.playMuteCycleMuteBars,
      clickSound: s.clickSound,
      accentSound: s.accentSound,
      accentSoundThreshold: s.accentSoundThreshold,
      hapticEnabled: s.hapticEnabled,
      vibrationIntensity: s.vibrationIntensity,
    };

    const updated = { ...project, snapshot, currentBpm: m.bpm };
    // Update store silently (don't trigger another save cycle)
    useProjectStore.setState({
      projects: projects.map((p) => p.id === activeProjectId ? updated : p),
    });
    db.putProject(updated).catch(console.error);
  }, 1000); // 1 second debounce — less aggressive than metronome/settings
}

// ─── Hydrate from IDB ───

export async function hydrateStores(): Promise<void> {
  const [metronomeData, settingsData] = await Promise.all([
    db.getSetting<PersistedMetronome>(METRONOME_KEY),
    db.getSetting<PersistedSettings>(SETTINGS_KEY),
  ]);

  if (metronomeData) {
    // If data is from before schema v2 (the broken audio era), reset volume to safe default
    if (!metronomeData._schemaVersion || metronomeData._schemaVersion < SCHEMA_VERSION) {
      console.info('Persistence: upgrading from schema v%d → v%d, resetting volume to default',
        metronomeData._schemaVersion ?? 1, SCHEMA_VERSION);
      metronomeData.volume = 0.8; // DEFAULT_VOLUME
    }

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
