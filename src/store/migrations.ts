/**
 * Migration registry — ALL persisted-data schema evolution lives here.
 */

import type { IDBPDatabase } from 'idb';
import type { PersistedMetronome, PersistedSettings } from './persisted-shapes';

export const METRONOME_SCHEMA_VERSION = 2;

type MetronomeMigration = (data: PersistedMetronome) => void;

const METRONOME_MIGRATIONS: Record<number, MetronomeMigration> = {
  2: (data) => {
    data.volume = 0.8;
  },
};

export function migrateMetronome(data: PersistedMetronome): PersistedMetronome {
  let version = data._schemaVersion ?? 1;
  while (version < METRONOME_SCHEMA_VERSION) {
    version++;
    const migrate = METRONOME_MIGRATIONS[version];
    if (migrate) {
      console.info('[migrations] metronome state → v%d', version);
      migrate(data);
    }
  }
  data._schemaVersion = METRONOME_SCHEMA_VERSION;
  return data;
}

export function migrateSettings(
  data: PersistedSettings & { latencyOffset?: number; swipeNavEnabled?: boolean },
): PersistedSettings {
  if (data.latencyOffset !== undefined && data.calibratedOffset === undefined) {
    console.info('[migrations] settings: latencyOffset → calibratedOffset');
    data.calibratedOffset = data.latencyOffset;
    data.manualAdjustment = 0;
  }

  // Navigation is deliberately tap-only now. Remove the retired setting so
  // old IndexedDB records cannot re-introduce dead state during hydration.
  if ('swipeNavEnabled' in data) {
    delete data.swipeNavEnabled;
  }

  return data;
}

export const DB_NAME = 'polypro';
export const DB_VERSION = 4;

export function upgradeDatabase(db: IDBPDatabase): void {
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings');
  }
  if (!db.objectStoreNames.contains('presets')) {
    db.createObjectStore('presets', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('projects')) {
    db.createObjectStore('projects', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('sessions')) {
    const store = db.createObjectStore('sessions', { keyPath: 'id' });
    store.createIndex('projectId', 'projectId');
    store.createIndex('date', 'date');
  }
  if (!db.objectStoreNames.contains('recordings')) {
    db.createObjectStore('recordings');
  }
  if (!db.objectStoreNames.contains('instrumentProfiles')) {
    db.createObjectStore('instrumentProfiles', { keyPath: 'name' });
  }
  if (!db.objectStoreNames.contains('customSamples')) {
    db.createObjectStore('customSamples', { keyPath: 'id' });
  }
}
