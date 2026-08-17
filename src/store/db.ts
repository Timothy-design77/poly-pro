import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, upgradeDatabase } from './migrations';
import type { MetronomeSnapshot } from './persisted-shapes';
export type { MetronomeSnapshot } from './persisted-shapes';

export interface PolyProDB {
  settings: { key: string; value: unknown };
  presets: { key: string; value: PresetRecord };
  projects: { key: string; value: ProjectRecord };
  sessions: { key: string; value: SessionRecord };
  recordings: { key: string; value: Blob | string };
}

export interface CustomSampleRecord {
  id: string;
  name: string;
  blob: Blob;
  durationMs: number;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  icon: string;
  created: string;
  lastOpened: string;
  startBpm: number;
  goalBpm: number;
  currentBpm: number;
  accuracyTarget: number;
  autoAdvance: boolean;
  advanceAfterN: number;
  bpmStep: number;
  consecutiveCount: number;
  presetId: string | null;
  sessionIds: string[];
  snapshot: MetronomeSnapshot | null;
}

export interface PresetRecord {
  id: string;
  name: string;
  projectId: string | null;
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
  clickSound: string;
  accentSound: string;
  created: string;
}

export interface SessionRecord {
  id: string;
  date: string;
  projectId: string | null;
  bpm: number;
  meter: string;
  subdivision: number;
  durationMs: number;
  totalHits: number;
  avgDelta: number;
  stdDev: number;
  perfectPct: number;
  hasRecording: boolean;
  analyzed?: boolean;
  score?: number;
  sigma?: number;
  meanOffset?: number;
  hitRate?: number;
  goodPct?: number;
  totalDetected?: number;
  totalScored?: number;
  totalExpected?: number;
  scoringWindowMs?: number;
  flamMergeMs?: number;
  noiseFloor?: number;
  autoLatencyMs?: number;
  sigmaLevel?: string;
  fatigueRatio?: number;
  maxDrift?: number;
  headlines?: Array<{ text: string; link?: string }> | string[];
  swingRatio?: number;
  swingSigma?: number;
  hasSwing?: boolean;
  grooveConsistency?: number | null;
  accentAdherence?: number | null;
  dynamicRange?: number | null;
  velocityDecaySlope?: number | null;
  velocityDecayLabel?: string;
  recordingSampleRate?: number;
}

export interface HitEventsRecord {
  sessionId: string;
  scoredOnsets: Array<{
    time: number;
    delta: number;
    absDelta: number;
    peak: number;
    matchedBeatTime: number;
    matchedBeatIndex: number;
    scored: boolean;
    measurePosition: number;
    spectralFeatures?: {
      centroid: number;
      bandwidth: number;
      rolloff: number;
      zeroCrossingRate: number;
      bandEnergy: [number, number, number, number, number];
      attackTime: number;
    } | null;
    instrumentLabel?: string;
    instrumentConfidence?: number;
    instrumentCandidates?: Array<{ label: string; score: number }>;
  }>;
  rawOnsets: Array<{
    time: number;
    peak: number;
    flux: number;
    isFlam: boolean;
  }>;
  gridBeats?: Array<{
    time: number;
    beatIndex: number;
    measure: number;
    isMainBeat: boolean;
    isDownbeat: boolean;
    trackId: string;
  }>;
}

export class DatabaseUnavailableError extends Error {
  readonly code = 'DATABASE_UNAVAILABLE';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseUnavailableError';
  }
}

const REQUIRED_STORES = ['settings', 'projects', 'sessions', 'recordings'] as const;
const DB_SOFT_TIMEOUT_MS = 3_000;
const DB_HARD_TIMEOUT_MS = 10_000;

let dbPromise: Promise<IDBPDatabase> | null = null;

function hasRequiredStores(database: IDBPDatabase): boolean {
  return REQUIRED_STORES.every((store) => database.objectStoreNames.contains(store));
}

function getDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBPDatabase>((resolve, reject) => {
    let blocked = false;
    let settled = false;

    const finishResolve = (database: IDBPDatabase) => {
      if (settled) {
        database.close();
        return;
      }
      settled = true;
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      resolve(database);
    };

    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(softTimeout);
      clearTimeout(hardTimeout);
      dbPromise = null;
      reject(error instanceof DatabaseUnavailableError
        ? error
        : new DatabaseUnavailableError('Poly Pro could not open local storage.', { cause: error }));
    };

    const softTimeout = window.setTimeout(() => {
      if (settled) return;
      const reason = blocked
        ? 'A previous Poly Pro tab or service worker still holds an older database connection.'
        : 'The browser has not completed the local-storage request.';
      console.warn(`[db] Local storage is taking longer than expected. ${reason}`);
    }, DB_SOFT_TIMEOUT_MS);

    const hardTimeout = window.setTimeout(() => {
      if (settled) return;

      if (!blocked) {
        finishReject(new DatabaseUnavailableError(
          'Local storage did not respond. User data was left untouched; reload the app or free browser storage before retrying.',
        ));
        return;
      }

      // A blocked upgrade may still allow the current schema to open safely.
      // Use it only when all stores required by the running app already exist.
      openDB(DB_NAME).then((database) => {
        if (!hasRequiredStores(database)) {
          database.close();
          finishReject(new DatabaseUnavailableError(
            'A database upgrade is blocked by another Poly Pro tab. Close other Poly Pro windows and reload. No data was deleted.',
          ));
          return;
        }
        console.warn('[db] Using the current database schema until the blocked upgrade can complete.');
        finishResolve(database);
      }).catch((error) => {
        finishReject(new DatabaseUnavailableError(
          'Poly Pro could not open its existing database. No automatic reset was performed.',
          { cause: error },
        ));
      });
    }, DB_HARD_TIMEOUT_MS);

    openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        upgradeDatabase(database);
      },
      blocked(currentVersion, blockedVersion) {
        blocked = true;
        console.warn(
          `[db] Database upgrade blocked: v${currentVersion} → v${blockedVersion}. Close other Poly Pro tabs.`,
        );
      },
      blocking() {
        // Cooperate with newer tabs by releasing this connection. The next DB
        // operation will reopen through getDB().
        void closeDatabaseConnection();
      },
      terminated() {
        dbPromise = null;
        console.error('[db] Browser terminated the database connection.');
      },
    }).then((database) => {
      if (!hasRequiredStores(database)) {
        database.close();
        finishReject(new DatabaseUnavailableError(
          'Local storage opened without required stores. No data was modified.',
        ));
        return;
      }
      finishResolve(database);
    }).catch(finishReject);
  });

  return dbPromise;
}

export async function closeDatabaseConnection(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    const database = await pending;
    database.close();
  } catch {
    // The connection was already unavailable; resetting the cached promise is
    // enough to permit an explicit retry.
  }
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const database = await getDB();
  return database.get('settings', key) as Promise<T | undefined>;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const database = await getDB();
  await database.put('settings', value, key);
}

export async function getAllProjects(): Promise<ProjectRecord[]> {
  const database = await getDB();
  return database.getAll('projects');
}

export async function putProject(project: ProjectRecord): Promise<void> {
  const database = await getDB();
  await database.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('projects', id);
}

export async function getAllPresets(): Promise<PresetRecord[]> {
  const database = await getDB();
  return database.getAll('presets');
}

export async function putPreset(preset: PresetRecord): Promise<void> {
  const database = await getDB();
  await database.put('presets', preset);
}

export async function deletePreset(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('presets', id);
}

export async function getAllSessions(): Promise<SessionRecord[]> {
  const database = await getDB();
  return database.getAll('sessions');
}

export async function getSessionsByProject(projectId: string): Promise<SessionRecord[]> {
  const database = await getDB();
  return database.getAllFromIndex('sessions', 'projectId', projectId);
}

export async function putSession(session: SessionRecord): Promise<void> {
  const database = await getDB();
  await database.put('sessions', session);
}

export async function deleteSession(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('sessions', id);
}

export async function putRecording(sessionId: string, blob: Blob): Promise<void> {
  const database = await getDB();
  await database.put('recordings', blob, sessionId);
}

export async function getRecording(sessionId: string): Promise<Blob | undefined> {
  const database = await getDB();
  return database.get('recordings', sessionId);
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const database = await getDB();
  await database.delete('recordings', sessionId);
}

export async function putHitEvents(record: HitEventsRecord): Promise<void> {
  const database = await getDB();
  const json = JSON.stringify(record);
  await database.put('recordings', json, `hitevents:${record.sessionId}`);
  console.log(
    `Saved hitEvents for ${record.sessionId}: ${record.scoredOnsets.length} scored, ${record.rawOnsets.length} raw (${(json.length / 1024).toFixed(1)}KB)`,
  );
}

export async function getHitEvents(sessionId: string): Promise<HitEventsRecord | undefined> {
  const database = await getDB();
  const stored = await database.get('recordings', `hitevents:${sessionId}`);
  if (!stored) return undefined;
  try {
    let text: string;
    if (typeof stored === 'string') text = stored;
    else if (stored instanceof Blob) text = await stored.text();
    else return undefined;
    return JSON.parse(text) as HitEventsRecord;
  } catch {
    return undefined;
  }
}

export async function deleteHitEvents(sessionId: string): Promise<void> {
  const database = await getDB();
  await database.delete('recordings', `hitevents:${sessionId}`);
}

export interface InstrumentProfileRecord {
  name: string;
  samples: Array<{
    features: {
      centroid: number;
      bandwidth: number;
      rolloff: number;
      zeroCrossingRate: number;
      bandEnergy: [number, number, number, number, number];
      attackTime: number;
    };
    label: string;
  }>;
  accuracy: number;
  lastTrained: string;
}

export async function getAllInstrumentProfiles(): Promise<InstrumentProfileRecord[]> {
  const database = await getDB();
  return database.getAll('instrumentProfiles');
}

export async function getInstrumentProfile(name: string): Promise<InstrumentProfileRecord | undefined> {
  const database = await getDB();
  return database.get('instrumentProfiles', name);
}

export async function putInstrumentProfile(profile: InstrumentProfileRecord): Promise<void> {
  const database = await getDB();
  await database.put('instrumentProfiles', profile);
}

export async function deleteInstrumentProfile(name: string): Promise<void> {
  const database = await getDB();
  await database.delete('instrumentProfiles', name);
}

export async function clearAllInstrumentProfiles(): Promise<void> {
  const database = await getDB();
  await database.clear('instrumentProfiles');
}

export async function getAllCustomSamples(): Promise<CustomSampleRecord[]> {
  const database = await getDB();
  return database.getAll('customSamples');
}

export async function getCustomSample(id: string): Promise<CustomSampleRecord | undefined> {
  const database = await getDB();
  return database.get('customSamples', id);
}

export async function putCustomSample(record: CustomSampleRecord): Promise<void> {
  const database = await getDB();
  await database.put('customSamples', record);
}

export async function deleteCustomSample(id: string): Promise<void> {
  const database = await getDB();
  await database.delete('customSamples', id);
}

export async function clearAllCustomSamples(): Promise<void> {
  const database = await getDB();
  await database.clear('customSamples');
}
