/**
 * Persistence layer for metronome and settings stores.
 * - Subscribes to Zustand store changes via selectors (persisted fields
 *   only — transient state like currentBeats/currentBar/playing no longer
 *   schedules writes on every beat while playing)
 * - Debounce-writes to IndexedDB (500ms)
 * - Hydrates stores from IDB on startup (migrations applied centrally
 *   in migrations.ts)
 */

import { shallow } from 'zustand/shallow';
import { useMetronomeStore } from './metronome-store';
import { useSettingsStore } from './settings-store';
import {
  pickPersistedMetronome,
  pickPersistedSettings,
  captureSnapshot,
  type PersistedMetronome,
  type PersistedSettings,
} from './persisted-shapes';
import {
  METRONOME_SCHEMA_VERSION,
  migrateMetronome,
  migrateSettings,
} from './migrations';
import * as db from './db';

// Keys used in the 'settings' IDB store
const METRONOME_KEY = 'metronome-state';
const SETTINGS_KEY = 'settings-state';

// ─── Debounced writers ───

let metronomeTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;

function saveMetronome() {
  if (metronomeTimer) clearTimeout(metronomeTimer);
  metronomeTimer = setTimeout(() => {
    const data: PersistedMetronome = {
      _schemaVersion: METRONOME_SCHEMA_VERSION,
      ...pickPersistedMetronome(useMetronomeStore.getState()),
    };
    db.setSetting(METRONOME_KEY, data).catch(console.error);
  }, 500);
}

function saveSettings() {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    const data = pickPersistedSettings(useSettingsStore.getState());
    db.setSetting(SETTINGS_KEY, data).catch(console.error);
  }, 500);
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
    const snapshot = captureSnapshot(m, useSettingsStore.getState());

    const updated = { ...project, snapshot, currentBpm: m.bpm };
    // Update store directly — the project store has no persistence
    // subscription of its own, so this cannot re-trigger a save cycle.
    useProjectStore.setState({
      projects: projects.map((p) => (p.id === activeProjectId ? updated : p)),
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
    migrateMetronome(metronomeData);

    // Apply persisted state (only the fields we saved — don't touch transient state)
    useMetronomeStore.setState(metronomeData);
    // Rebuild track-0 to match persisted meter/subdivision/grouping
    const { meterNumerator, subdivision, beatGrouping } = metronomeData;
    const { createDefaultTrack } = await import('./types');
    const track0 = createDefaultTrack(meterNumerator, subdivision, 'track-0', beatGrouping);
    useMetronomeStore.setState({ tracks: [track0] });
  }

  if (settingsData) {
    useSettingsStore.setState(migrateSettings(settingsData));
  }
}

// ─── Subscribe to changes ───

export function startPersistence(): void {
  // Metronome: persisted fields drive the global-state write; tracks are
  // additionally included so accent/sound edits still refresh the active
  // project snapshot (tracks live in snapshots, not in global state).
  useMetronomeStore.subscribe(
    (s) => ({ ...pickPersistedMetronome(s), tracks: s.tracks }),
    () => {
      saveMetronome();
      saveActiveProjectSnapshot();
    },
    { equalityFn: shallow },
  );

  useSettingsStore.subscribe(
    pickPersistedSettings,
    () => {
      saveSettings();
      saveActiveProjectSnapshot();
    },
    { equalityFn: shallow },
  );
}
