/**
 * Migration registry — ALL persisted-data schema evolution lives here.
 *
 * Previously version handling was scattered across three mechanisms:
 *   1. _schemaVersion checks inline in persistence.ts (metronome state)
 *   2. Ad-hoc field renames inline in hydrateStores (settings)
 *   3. IDB object-store creation in db.ts's upgrade callback
 *
 * Consolidating them here means a schema change touches exactly one file,
 * and the upgrade order is explicit rather than implied.
 */

import type { IDBPDatabase } from 'idb';
import type { PersistedMetronome, PersistedSettings } from './persisted-shapes';

// ─── Persisted metronome state (key-value 'settings' store) ───

export const METRONOME_SCHEMA_VERSION = 2;

type MetronomeMigration = (data: PersistedMetronome) => void;

/**
 * Ordered migrations keyed by the version they upgrade TO.
 * A record at version N has had all migrations ≤ N applied.
 */
const METRONOME_MIGRATIONS: Record<number, MetronomeMigration> = {
  // v1 → v2: data from the broken-audio era could carry dangerous volume
  // values; reset to the safe default.
  2: (data) => {
    data.volume = 0.8; // DEFAULT_VOLUME
  },
};

/** Apply any pending migrations in order. Mutates and returns `data`. */
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

// ─── Persisted settings (key-value 'settings' store) ───

/**
 * Settings predate versioning, so migrations are detection-based.
 * Mutates and returns `data`.
 */
export function migrateSettings(
  data: PersistedSettings & { latencyOffset?: number },
): PersistedSettings {
  // Legacy: single latencyOffset split into calibratedOffset + manualAdjustment
  if (data.latencyOffset !== undefined && data.calibratedOffset === undefined) {
    console.info('[migrations] settings: latencyOffset → calibratedOffset');
    data.calibratedOffset = data.latencyOffset;
    data.manualAdjustment = 0;
  }
  return data;
}

// ─── IndexedDB structure ───

export const DB_NAME = 'polypro';
export const DB_VERSION = 4;

/**
 * Object-store creation/upgrade, invoked by idb's upgrade callback.
 * Each block is idempotent (guarded by objectStoreNames.contains), so this
 * brings any older database forward regardless of starting version.
 */
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
