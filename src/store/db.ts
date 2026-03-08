import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'polypro';
const DB_VERSION = 1;

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
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
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
      },
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
