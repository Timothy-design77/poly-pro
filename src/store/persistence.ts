/**
 * Persistence layer for metronome and settings stores.
 * Persisted writes are debounced during normal interaction and flushed on
 * pagehide so the newest state is not silently lost when the PWA is closed.
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

const METRONOME_KEY = 'metronome-state';
const SETTINGS_KEY = 'settings-state';

let metronomeTimer: ReturnType<typeof setTimeout> | null = null;
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceStarted = false;
let unsubscribeMetronome: (() => void) | null = null;
let unsubscribeSettings: (() => void) | null = null;

async function persistMetronomeNow(): Promise<void> {
  if (metronomeTimer) clearTimeout(metronomeTimer);
  metronomeTimer = null;
  const data: PersistedMetronome = {
    _schemaVersion: METRONOME_SCHEMA_VERSION,
    ...pickPersistedMetronome(useMetronomeStore.getState()),
  };
  await db.setSetting(METRONOME_KEY, data);
}

async function persistSettingsNow(): Promise<void> {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = null;
  await db.setSetting(SETTINGS_KEY, pickPersistedSettings(useSettingsStore.getState()));
}

async function persistActiveProjectSnapshotNow(): Promise<void> {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = null;
  const { useProjectStore } = await import('./project-store');
  const { projects, activeProjectId } = useProjectStore.getState();
  if (!activeProjectId) return;
  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) return;

  const metronome = useMetronomeStore.getState();
  const snapshot = captureSnapshot(metronome, useSettingsStore.getState());
  const updated = { ...project, snapshot, currentBpm: metronome.bpm };
  useProjectStore.setState({
    projects: projects.map((p) => (p.id === activeProjectId ? updated : p)),
  });
  await db.putProject(updated);
}

function saveMetronome(): void {
  if (metronomeTimer) clearTimeout(metronomeTimer);
  metronomeTimer = setTimeout(() => { persistMetronomeNow().catch(console.error); }, 500);
}

function saveSettings(): void {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => { persistSettingsNow().catch(console.error); }, 500);
}

function saveActiveProjectSnapshot(): void {
  if (snapshotTimer) clearTimeout(snapshotTimer);
  snapshotTimer = setTimeout(() => { persistActiveProjectSnapshotNow().catch(console.error); }, 1000);
}

export async function flushPersistence(): Promise<void> {
  await Promise.all([
    persistMetronomeNow(),
    persistSettingsNow(),
    persistActiveProjectSnapshotNow(),
  ]);
}

export async function hydrateStores(): Promise<void> {
  const [metronomeData, settingsData] = await Promise.all([
    db.getSetting<PersistedMetronome>(METRONOME_KEY),
    db.getSetting<PersistedSettings>(SETTINGS_KEY),
  ]);

  if (metronomeData) {
    migrateMetronome(metronomeData);
    useMetronomeStore.setState(metronomeData);

    // Records created before schema v3 did not persist tracks globally.
    if (!Array.isArray((metronomeData as Partial<PersistedMetronome>).tracks)) {
      const { meterNumerator, subdivision, beatGrouping } = metronomeData;
      const { createDefaultTrack } = await import('./types');
      const track0 = createDefaultTrack(meterNumerator, subdivision, 'track-0', beatGrouping);
      useMetronomeStore.setState({ tracks: [track0] });
    }
  }

  if (settingsData) useSettingsStore.setState(migrateSettings(settingsData));
}

const handlePageHide = () => {
  flushPersistence().catch(console.error);
};

export function startPersistence(): void {
  if (persistenceStarted) return;
  persistenceStarted = true;

  unsubscribeMetronome = useMetronomeStore.subscribe(
    pickPersistedMetronome,
    () => {
      saveMetronome();
      saveActiveProjectSnapshot();
    },
    { equalityFn: shallow },
  );

  unsubscribeSettings = useSettingsStore.subscribe(
    pickPersistedSettings,
    () => {
      saveSettings();
      saveActiveProjectSnapshot();
    },
    { equalityFn: shallow },
  );

  window.addEventListener('pagehide', handlePageHide);
}

export function stopPersistence(): void {
  unsubscribeMetronome?.();
  unsubscribeSettings?.();
  unsubscribeMetronome = null;
  unsubscribeSettings = null;
  window.removeEventListener('pagehide', handlePageHide);
  persistenceStarted = false;
}
