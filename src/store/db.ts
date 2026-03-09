import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'polypro';
const DB_VERSION = 3;

export interface PolyProDB {
  settings: { key: string; value: unknown };
  presets: { key: string; value: PresetRecord };
  projects: { key: string; value: ProjectRecord };
  sessions: { key: string; value: SessionRecord };
  recordings: { key: string; value: Blob };
}

export interface MetronomeSnapshot {
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  beatGrouping: number[];
  subdivision: number;
  volume: number;
  swing: number;
  tracks: unknown[]; // TrackConfig[] stored as JSON-safe
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
  // Settings
  clickSound: string;
  accentSound: string;
  clickVolume?: number; // DEPRECATED — volume is now only in metronomeStore.volume. Kept optional for IDB backward compat.
  accentSoundThreshold: number;
  hapticEnabled: boolean;
  vibrationIntensity: number;
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
  /** Full metronome + settings snapshot, auto-saved on project switch */
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
  // Phase 5 analysis fields (populated after post-processing)
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
  // Phase 9: Groove
  swingRatio?: number;
  swingSigma?: number;
  hasSwing?: boolean;
  grooveConsistency?: number | null;
  // Phase 9: Dynamics
  accentAdherence?: number | null;
  dynamicRange?: number | null;
  velocityDecaySlope?: number | null;
  velocityDecayLabel?: string;
}

/** Onset data stored separately from session metadata (can be large) */
export interface HitEventsRecord {
  sessionId: string;
  /** Scored onsets with deviations (serializable) */
  scoredOnsets: Array<{
    time: number;
    delta: number;
    absDelta: number;
    peak: number;
    matchedBeatTime: number;
    matchedBeatIndex: number;
    scored: boolean;
    measurePosition: number;
    /** Spectral features (Phase 8) */
    spectralFeatures?: {
      centroid: number;
      bandwidth: number;
      rolloff: number;
      zeroCrossingRate: number;
      bandEnergy: [number, number, number, number, number];
      attackTime: number;
    } | null;
    /** Instrument classification (Phase 8) */
    instrumentLabel?: string;
    instrumentConfidence?: number;
    instrumentCandidates?: Array<{ label: string; score: number }>;
  }>;
  /** Raw detected onsets (for re-analysis) */
  rawOnsets: Array<{
    time: number;
    peak: number;
    flux: number;
    isFlam: boolean;
  }>;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBPDatabase>((resolve, reject) => {
      // Timeout: if the upgrade is blocked for >3s, delete and retry
      let blocked = false;
      const timeout = setTimeout(() => {
        if (blocked) {
          console.warn('[db] IDB upgrade blocked for 3s — deleting old DB and retrying');
          dbPromise = null;
          indexedDB.deleteDatabase(DB_NAME);
          // Retry after delete
          setTimeout(() => {
            getDB().then(resolve, reject);
          }, 200);
        }
      }, 3000);

      openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
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
        },
        blocked(currentVersion, blockedVersion) {
          blocked = true;
          console.warn(`[db] IDB upgrade blocked: v${currentVersion} → v${blockedVersion}. Old connection still open.`);
        },
      }).then((db) => {
        clearTimeout(timeout);
        resolve(db);
      }).catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }
  return dbPromise;
}

// ─── Settings ───

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get('settings', key) as Promise<T | undefined>;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

// ─── Projects ───

export async function getAllProjects(): Promise<ProjectRecord[]> {
  const db = await getDB();
  return db.getAll('projects');
}

export async function putProject(project: ProjectRecord): Promise<void> {
  const db = await getDB();
  await db.put('projects', project);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('projects', id);
}

// ─── Presets ───

export async function getAllPresets(): Promise<PresetRecord[]> {
  const db = await getDB();
  return db.getAll('presets');
}

export async function putPreset(preset: PresetRecord): Promise<void> {
  const db = await getDB();
  await db.put('presets', preset);
}

export async function deletePreset(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('presets', id);
}

// ─── Sessions ───

export async function getAllSessions(): Promise<SessionRecord[]> {
  const db = await getDB();
  return db.getAll('sessions');
}

export async function getSessionsByProject(projectId: string): Promise<SessionRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex('sessions', 'projectId', projectId);
}

export async function putSession(session: SessionRecord): Promise<void> {
  const db = await getDB();
  await db.put('sessions', session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('sessions', id);
}

// ─── Recordings ───

export async function putRecording(sessionId: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('recordings', blob, sessionId);
}

export async function getRecording(sessionId: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get('recordings', sessionId);
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete('recordings', sessionId);
}

// ─── Hit Events (stored in recordings store with key prefix) ───

export async function putHitEvents(record: HitEventsRecord): Promise<void> {
  const db = await getDB();
  const json = JSON.stringify(record);
  await db.put('recordings', json, `hitevents:${record.sessionId}`);
  console.log(`Saved hitEvents for ${record.sessionId}: ${record.scoredOnsets.length} scored, ${record.rawOnsets.length} raw (${(json.length / 1024).toFixed(1)}KB)`);
}

export async function getHitEvents(sessionId: string): Promise<HitEventsRecord | undefined> {
  const db = await getDB();
  const stored = await db.get('recordings', `hitevents:${sessionId}`);
  if (!stored) return undefined;
  try {
    // Handle both string (new) and Blob (legacy) formats
    let text: string;
    if (typeof stored === 'string') {
      text = stored;
    } else if (stored instanceof Blob) {
      text = await stored.text();
    } else {
      return undefined;
    }
    return JSON.parse(text) as HitEventsRecord;
  } catch {
    return undefined;
  }
}

export async function deleteHitEvents(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete('recordings', `hitevents:${sessionId}`);
}

// ─── Instrument Profiles ───

/** IDB record for an instrument profile */
export interface InstrumentProfileRecord {
  /** Instrument name (key) */
  name: string;
  /** Training samples: features + label */
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
  /** Cross-validation accuracy (0–1) */
  accuracy: number;
  /** ISO timestamp of last training */
  lastTrained: string;
}

export async function getAllInstrumentProfiles(): Promise<InstrumentProfileRecord[]> {
  const db = await getDB();
  return db.getAll('instrumentProfiles');
}

export async function getInstrumentProfile(name: string): Promise<InstrumentProfileRecord | undefined> {
  const db = await getDB();
  return db.get('instrumentProfiles', name);
}

export async function putInstrumentProfile(profile: InstrumentProfileRecord): Promise<void> {
  const db = await getDB();
  await db.put('instrumentProfiles', profile);
}

export async function deleteInstrumentProfile(name: string): Promise<void> {
  const db = await getDB();
  await db.delete('instrumentProfiles', name);
}

export async function clearAllInstrumentProfiles(): Promise<void> {
  const db = await getDB();
  await db.clear('instrumentProfiles');
}
