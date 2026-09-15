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
  recordingManifests: { key: string; value: RecordingManifest };
  recordingChunks: { key: string; value: Blob };
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
  recoveredRecording?: boolean;
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

export interface RecordingManifest {
  sessionId: string;
  sampleRate: number;
  chunkCount: number;
  totalSamples: number;
  finalized: boolean;
  createdAt: string;
  /** Updated on every durable chunk write; absent on older manifests. */
  updatedAt?: string;
  projectId: string | null;
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
}

export interface RecordingManifestMetadata {
  projectId: string | null;
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;
let activeDb: IDBPDatabase | null = null;

export function resetDBConnection(): void {
  try { activeDb?.close(); } catch {}
  activeDb = null;
  dbPromise = null;
}

function getDB(): Promise<IDBPDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBPDatabase>((resolve, reject) => {
    let settled = false;
    let blocked = false;

    const timeout = window.setTimeout(() => {
      if (settled || !blocked) return;
      settled = true;
      dbPromise = null;
      reject(new Error('Poly Pro storage is locked by another app tab or an older app instance. Close other Poly Pro tabs/windows, then retry. Your data has not been deleted.'));
    }, 8000);

    openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        upgradeDatabase(db);
      },
      blocked(currentVersion, blockedVersion) {
        blocked = true;
        console.warn(`[db] Upgrade blocked: v${currentVersion} → v${blockedVersion}`);
      },
      blocking() {
        console.warn('[db] A newer Poly Pro version needs the database; closing this connection.');
        resetDBConnection();
      },
      terminated() {
        console.warn('[db] IndexedDB connection terminated unexpectedly.');
        activeDb = null;
        dbPromise = null;
      },
    }).then((db) => {
      if (settled) {
        db.close();
        return;
      }
      window.clearTimeout(timeout);
      settled = true;
      activeDb = db;
      resolve(db);
    }).catch((error) => {
      if (settled) return;
      window.clearTimeout(timeout);
      settled = true;
      dbPromise = null;
      reject(error);
    });
  });

  return dbPromise;
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get('settings', key) as Promise<T | undefined>;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put('settings', value, key);
}

export async function clearAllSettings(): Promise<void> {
  const db = await getDB();
  await db.clear('settings');
}

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

export async function clearAllPresets(): Promise<void> {
  const db = await getDB();
  await db.clear('presets');
}

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

function recordingChunkKey(sessionId: string, index: number): string {
  return `${sessionId}:${String(index).padStart(6, '0')}`;
}

export async function beginChunkedRecording(
  sessionId: string,
  sampleRate: number,
  metadata: RecordingManifestMetadata,
): Promise<void> {
  const db = await getDB();
  const now = new Date().toISOString();
  const manifest: RecordingManifest = {
    sessionId,
    sampleRate,
    chunkCount: 0,
    totalSamples: 0,
    finalized: false,
    createdAt: now,
    updatedAt: now,
    ...metadata,
  };
  await db.put('recordingManifests', manifest);
}

export async function appendRecordingChunk(
  sessionId: string,
  index: number,
  samples: Float32Array,
): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['recordingChunks', 'recordingManifests'], 'readwrite');
  const manifestStore = tx.objectStore('recordingManifests');
  const chunkStore = tx.objectStore('recordingChunks');
  const manifest = await manifestStore.get(sessionId) as RecordingManifest | undefined;
  if (!manifest) throw new Error('Recording manifest missing while saving audio');

  // Copy exactly this typed-array view into an ArrayBuffer accepted by Blob.
  const bytes = new Uint8Array(samples.byteLength);
  bytes.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength));
  const blob = new Blob([bytes.buffer], { type: 'application/octet-stream' });
  await chunkStore.put(blob, recordingChunkKey(sessionId, index));
  manifest.chunkCount = Math.max(manifest.chunkCount, index + 1);
  manifest.totalSamples += samples.length;
  manifest.updatedAt = new Date().toISOString();
  await manifestStore.put(manifest);
  await tx.done;
}

export async function finalizeChunkedRecording(sessionId: string): Promise<RecordingManifest> {
  const db = await getDB();
  const manifest = await db.get('recordingManifests', sessionId) as RecordingManifest | undefined;
  if (!manifest || manifest.chunkCount === 0) throw new Error('No audio chunks were captured');
  const finalized = { ...manifest, finalized: true, updatedAt: new Date().toISOString() };
  await db.put('recordingManifests', finalized);
  return finalized;
}

export async function getRecordingManifest(sessionId: string): Promise<RecordingManifest | undefined> {
  const db = await getDB();
  return db.get('recordingManifests', sessionId) as Promise<RecordingManifest | undefined>;
}

export async function getAllRecordingManifests(): Promise<RecordingManifest[]> {
  const db = await getDB();
  return db.getAll('recordingManifests') as Promise<RecordingManifest[]>;
}

export async function discardChunkedRecording(sessionId: string): Promise<void> {
  const db = await getDB();
  const manifest = await db.get('recordingManifests', sessionId) as RecordingManifest | undefined;
  const tx = db.transaction(['recordingChunks', 'recordingManifests', 'recordings'], 'readwrite');
  const tasks: Promise<unknown>[] = [];
  if (manifest) {
    for (let i = 0; i < manifest.chunkCount; i++) {
      tasks.push(tx.objectStore('recordingChunks').delete(recordingChunkKey(sessionId, i)));
    }
  }
  tasks.push(tx.objectStore('recordingManifests').delete(sessionId));
  tasks.push(tx.objectStore('recordings').delete(sessionId));
  await Promise.all(tasks);
  await tx.done;
}

/**
 * Recover audio that reached durable chunk storage before an app/browser crash
 * but never got its final SessionRecord. At most the final in-flight sub-second
 * worklet buffer is lost; completed chunks remain user-visible and playable.
 */
export async function recoverOrphanedRecordings(staleMs = 10_000): Promise<number> {
  const db = await getDB();
  const [manifests, sessions] = await Promise.all([
    db.getAll('recordingManifests') as Promise<RecordingManifest[]>,
    db.getAll('sessions') as Promise<SessionRecord[]>,
  ]);
  const sessionIds = new Set(sessions.map((session) => session.id));
  let recovered = 0;

  for (const manifest of manifests) {
    if (sessionIds.has(manifest.sessionId) || manifest.chunkCount === 0 || manifest.totalSamples === 0) continue;
    const lastWriteMs = new Date(manifest.updatedAt ?? manifest.createdAt).getTime();
    // A non-finalized manifest may belong to a recording still active in another tab.
    // Only recover it after its durable chunk heartbeat has gone stale.
    if (!manifest.finalized && Date.now() - lastWriteMs < staleMs) continue;
    const durationMs = Math.max(1, Math.round((manifest.totalSamples / manifest.sampleRate) * 1000));
    const recoveredSession: SessionRecord = {
      id: manifest.sessionId,
      date: manifest.createdAt,
      projectId: manifest.projectId,
      bpm: manifest.bpm,
      meter: `${manifest.meterNumerator}/${manifest.meterDenominator}`,
      subdivision: manifest.subdivision,
      durationMs,
      totalHits: 0,
      avgDelta: 0,
      stdDev: 0,
      perfectPct: 0,
      hasRecording: true,
      analyzed: false,
      recordingSampleRate: manifest.sampleRate,
      recoveredRecording: true,
    };
    const tx = db.transaction(['sessions', 'recordingManifests'], 'readwrite');
    await Promise.all([
      tx.objectStore('sessions').put(recoveredSession),
      tx.objectStore('recordingManifests').put({ ...manifest, finalized: true, updatedAt: new Date().toISOString() }),
    ]);
    await tx.done;
    recovered++;
  }
  return recovered;
}

export async function cleanupIncompleteRecordings(maxAgeMs = 60 * 60 * 1000): Promise<void> {
  const manifests = await getAllRecordingManifests();
  const sessions = await getAllSessions();
  const sessionIds = new Set(sessions.map((session) => session.id));
  const now = Date.now();
  for (const manifest of manifests) {
    if (
      !manifest.finalized &&
      manifest.chunkCount === 0 &&
      !sessionIds.has(manifest.sessionId) &&
      now - new Date(manifest.createdAt).getTime() > maxAgeMs
    ) {
      await discardChunkedRecording(manifest.sessionId);
    }
  }
}

export async function putRecording(sessionId: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put('recordings', blob, sessionId);
}

export async function getRecording(sessionId: string): Promise<Blob | undefined> {
  const db = await getDB();
  const legacy = await db.get('recordings', sessionId);
  if (legacy instanceof Blob) return legacy;

  const manifest = await db.get('recordingManifests', sessionId) as RecordingManifest | undefined;
  if (!manifest?.finalized || manifest.chunkCount === 0) return undefined;

  const tx = db.transaction('recordingChunks', 'readonly');
  const store = tx.objectStore('recordingChunks');
  const requests = Array.from({ length: manifest.chunkCount }, (_, index) =>
    store.get(recordingChunkKey(sessionId, index)) as Promise<Blob | undefined>
  );
  const chunks = await Promise.all(requests);
  await tx.done;
  if (chunks.some((chunk) => !chunk)) return undefined;
  return new Blob(chunks as Blob[], { type: 'application/octet-stream' });
}

export async function deleteRecording(sessionId: string): Promise<void> {
  const db = await getDB();
  const manifest = await db.get('recordingManifests', sessionId) as RecordingManifest | undefined;
  const tx = db.transaction(['recordings', 'recordingChunks', 'recordingManifests'], 'readwrite');
  const tasks: Promise<unknown>[] = [tx.objectStore('recordings').delete(sessionId)];
  if (manifest) {
    for (let i = 0; i < manifest.chunkCount; i++) {
      tasks.push(tx.objectStore('recordingChunks').delete(recordingChunkKey(sessionId, i)));
    }
    tasks.push(tx.objectStore('recordingManifests').delete(sessionId));
  }
  await Promise.all(tasks);
  await tx.done;
}

export async function putHitEvents(record: HitEventsRecord): Promise<void> {
  const db = await getDB();
  await db.put('recordings', JSON.stringify(record), `hitevents:${record.sessionId}`);
}

export async function getHitEvents(sessionId: string): Promise<HitEventsRecord | undefined> {
  const db = await getDB();
  const stored = await db.get('recordings', `hitevents:${sessionId}`);
  if (!stored) return undefined;
  try {
    const text = typeof stored === 'string'
      ? stored
      : stored instanceof Blob
        ? await stored.text()
        : null;
    return text ? JSON.parse(text) as HitEventsRecord : undefined;
  } catch {
    return undefined;
  }
}

export async function deleteHitEvents(sessionId: string): Promise<void> {
  const db = await getDB();
  await db.delete('recordings', `hitevents:${sessionId}`);
}

/** Persist analyzed session metadata and its event set in one IDB transaction. */
export async function putAnalysis(session: SessionRecord, hitEvents: HitEventsRecord): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
  await Promise.all([
    tx.objectStore('sessions').put(session),
    tx.objectStore('recordings').put(JSON.stringify(hitEvents), `hitevents:${hitEvents.sessionId}`),
  ]);
  await tx.done;
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

export async function getAllCustomSamples(): Promise<CustomSampleRecord[]> {
  const db = await getDB();
  return db.getAll('customSamples');
}

export async function getCustomSample(id: string): Promise<CustomSampleRecord | undefined> {
  const db = await getDB();
  return db.get('customSamples', id);
}

export async function putCustomSample(record: CustomSampleRecord): Promise<void> {
  const db = await getDB();
  await db.put('customSamples', record);
}

export async function deleteCustomSample(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('customSamples', id);
}

export async function clearAllCustomSamples(): Promise<void> {
  const db = await getDB();
  await db.clear('customSamples');
}

/** Clear user data without deleting the IndexedDB database/schema itself. */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const stores = [
    'settings', 'presets', 'projects', 'sessions', 'recordings',
    'instrumentProfiles', 'customSamples', 'recordingManifests', 'recordingChunks',
  ];
  const tx = db.transaction(stores, 'readwrite');
  await Promise.all(stores.map((name) => tx.objectStore(name).clear()));
  await tx.done;
}
