/** Local backup/import utilities with explicit memory-safety limits. */
import * as db from '../store/db';
import { beginCriticalActivity, isCriticalActivityActive } from './critical-activity';

import { validateSessions, validateProjects, validateSettings, validateEvents, validateProfiles, validatePresets, validateCustomMetadata } from './backup-validation';
import { flushPersistence } from '../store/persistence';

const MAX_FULL_BACKUP_ESTIMATED_BYTES = 512 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 768 * 1024 * 1024;
const MAX_IMPORT_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;

async function getJSZip() {
  const mod = await import('jszip');
  return mod.default;
}

export interface BackupManifest {
  version: 3;
  recordingTypes?: Record<string, string>;
  format: 'polypro-backup';
  createdAt: string;
  appVersion: string;
  includesRecordings: boolean;
  counts: {
    projects: number;
    sessions: number;
    recordings: number;
    profiles: number;
    customSamples?: number;
  };
}

export interface ExportProgress {
  stage: 'settings' | 'projects' | 'sessions' | 'hitevents' | 'recordings' | 'profiles' | 'zipping' | 'done';
  current: number;
  total: number;
}

export interface ImportPreview {
  manifest: BackupManifest;
  newProjects: number;
  newSessions: number;
  duplicateProjects: number;
  duplicateSessions: number;
}

export interface BackupOptions {
  includeRecordings?: boolean;
}

function estimateRawRecordingBytes(sessions: db.SessionRecord[]): number {
  return sessions.reduce((total, session) => {
    if (!session.hasRecording) return total;
    const sampleRate = session.recordingSampleRate ?? 48000;
    return total + Math.ceil((session.durationMs / 1000) * sampleRate * 4);
  }, 0);
}

export async function exportBackup(
  onProgress?: (p: ExportProgress) => void,
  options: BackupOptions = {},
): Promise<Blob> {
  if (isCriticalActivityActive()) throw new Error('Finish the current recording, analysis or data operation before making a backup.');
  const release = beginCriticalActivity('backup');
  try {
    await flushPersistence();
    const includeRecordings = options.includeRecordings !== false;
    const JSZip = await getJSZip();
    const zip = new JSZip();

    onProgress?.({ stage: 'settings', current: 0, total: 1 });
    const settingsKeys = [
      'metronome-state', 'settings-state', 'activeProjectId',
      'lastBackupAt', 'sessionsSinceBackup', 'mvsepConsent',
    ];
    const settings: Record<string, unknown> = {};
    for (const key of settingsKeys) {
      const value = await db.getSetting(key);
      if (value !== undefined) settings[key] = value;
    }
    zip.file('settings.json', JSON.stringify(settings, null, 2));

    onProgress?.({ stage: 'projects', current: 0, total: 1 });
    const projects = await db.getAllProjects();
    zip.file('projects.json', JSON.stringify(projects, null, 2));
    zip.file('presets.json', JSON.stringify(await db.getAllPresets()));

    onProgress?.({ stage: 'sessions', current: 0, total: 1 });
    const sessions = await db.getAllSessions();
    zip.file('sessions.json', JSON.stringify(sessions, null, 2));

    if (includeRecordings && estimateRawRecordingBytes(sessions) > MAX_FULL_BACKUP_ESTIMATED_BYTES) {
      throw new Error('Full backup is too large to package safely in this browser. Use Data-only Backup, then export/delete older audio separately.');
    }

    onProgress?.({ stage: 'profiles', current: 0, total: 1 });
    const profiles = await db.getAllInstrumentProfiles();
    zip.file('profiles.json', JSON.stringify(profiles, null, 2));

    const hiteventsFolder = zip.folder('hitevents')!;
    for (let i = 0; i < sessions.length; i++) {
      onProgress?.({ stage: 'hitevents', current: i, total: sessions.length });
      const events = await db.getHitEvents(sessions[i].id);
      if (events) hiteventsFolder.file(`${sessions[i].id}.json`, JSON.stringify(events));
    }

    let recordingCount = 0;
    const recordingTypes: Record<string, string> = {};
    if (includeRecordings) {
      const recordingsFolder = zip.folder('recordings')!;
      for (let i = 0; i < sessions.length; i++) {
        onProgress?.({ stage: 'recordings', current: i, total: sessions.length });
        if (!sessions[i].hasRecording) continue;
        const blob = await db.getRecording(sessions[i].id) ?? await db.getRecording(sessions[i].id + '-playback');
        if (!blob) continue;
        recordingsFolder.file(`${sessions[i].id}.pcm`, await blob.arrayBuffer());
        recordingTypes[sessions[i].id] = blob.type || 'application/octet-stream';
        recordingCount++;
      }
    }

    const customSamples = await db.getAllCustomSamples();
    const customSamplesFolder = zip.folder('customsamples')!;
    zip.file('customsamples.json', JSON.stringify(customSamples.map((sample) => ({
      id: sample.id,
      name: sample.name,
      durationMs: sample.durationMs,
      createdAt: sample.createdAt,
    })), null, 2));
    for (const sample of customSamples) {
      customSamplesFolder.file(`${sample.id.replace('custom:', '')}.wav`, await sample.blob.arrayBuffer());
    }

    const manifest: BackupManifest = {
      version: 3,
      recordingTypes,
      format: 'polypro-backup',
      createdAt: new Date().toISOString(),
      appVersion: '2.0.0',
      includesRecordings: includeRecordings,
      counts: {
        projects: projects.length,
        sessions: sessions.length,
        recordings: recordingCount,
        profiles: profiles.length,
        customSamples: customSamples.length,
      },
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    onProgress?.({ stage: 'zipping', current: 0, total: 1 });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    onProgress?.({ stage: 'done', current: 1, total: 1 });
    return blob;
  } finally {
    release();
  }
}

export function downloadBackup(blob: Blob, suffix = 'full'): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `polypro-backup-${suffix}-${new Date().toISOString().slice(0, 10)}.polypro`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function loadValidatedZip(file: File) {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('Backup file is too large to import safely on this device.');
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);
  const totalUncompressed = Object.values(zip.files).reduce((sum, entry) => {
    const size = Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0);
    return sum + size;
  }, 0);
  if (totalUncompressed > MAX_IMPORT_UNCOMPRESSED_BYTES) {
    throw new Error('Backup expands beyond the safe import limit.');
  }
  return zip;
}

async function readManifest(zip: Awaited<ReturnType<typeof loadValidatedZip>>): Promise<BackupManifest> {
  const file = zip.file('manifest.json');
  if (!file) throw new Error('Invalid backup: no manifest.json');
  const raw = JSON.parse(await file.async('text')) as Partial<BackupManifest> & { version?: number };
  if (raw.format !== 'polypro-backup' || !raw.version || raw.version < 2 || raw.version > 3) {
    throw new Error('Unsupported Poly Pro backup format');
  }
  return {
    ...(raw as BackupManifest),
    version: 3,
    includesRecordings: raw.includesRecordings ?? ((raw.counts?.recordings ?? 0) > 0),
  };
}

export async function previewBackup(file: File): Promise<ImportPreview> {
  const zip = await loadValidatedZip(file);
  const manifest = await readManifest(zip);
  const projectsFile = zip.file('projects.json');
  const sessionsFile = zip.file('sessions.json');
  const backupProjects = validateProjects(projectsFile ? JSON.parse(await projectsFile.async('text')) : []);
  const backupSessions = validateSessions(sessionsFile ? JSON.parse(await sessionsFile.async('text')) : []);
  if (!Array.isArray(backupProjects) || !Array.isArray(backupSessions)) throw new Error('Backup metadata is malformed');

  const existingProjects = await db.getAllProjects();
  const existingSessions = await db.getAllSessions();
  const projectIds = new Set(existingProjects.map((project) => project.id));
  const sessionIds = new Set(existingSessions.map((session) => session.id));
  const duplicateProjects = backupProjects.filter((project) => projectIds.has(project.id)).length;
  const duplicateSessions = backupSessions.filter((session) => sessionIds.has(session.id)).length;

  return {
    manifest,
    newProjects: backupProjects.length - duplicateProjects,
    newSessions: backupSessions.length - duplicateSessions,
    duplicateProjects,
    duplicateSessions,
  };
}

export async function importBackup(
  file: File,
  onProgress?: (p: ExportProgress) => void,
  options: { restoreSettings?: boolean } = {},
): Promise<{ imported: { projects: number; sessions: number }; skipped: number }> {
  if (isCriticalActivityActive()) throw new Error('Finish the current recording, analysis or data operation before importing.');
  const release = beginCriticalActivity('import');
  try {
    const zip = await loadValidatedZip(file);
    const manifest = await readManifest(zip);
    const readJSON = async (name: string, fallback: unknown) => {
      const entry = zip.file(name); return entry ? JSON.parse(await entry.async('text')) as unknown : fallback;
    };
    onProgress?.({ stage: 'settings', current: 0, total: 1 });
    const settings = validateSettings(await readJSON('settings.json', {}));
    const projects = validateProjects(await readJSON('projects.json', []));
    const sessions = validateSessions(await readJSON('sessions.json', []));
    const profiles = validateProfiles(await readJSON('profiles.json', []));
    const presets = validatePresets(await readJSON('presets.json', []));
    const customMetadata = validateCustomMetadata(await readJSON('customsamples.json', []));
    const events: db.HitEventsRecord[] = [];
    const recordings: db.BackupData['recordings'] = [];
    for (const session of sessions) {
      const eventData = await readJSON(`hitevents/${session.id}.json`, null);
      if (eventData) events.push(validateEvents(eventData, session.id));
      const file = zip.file(`recordings/${session.id}.pcm`);
      if (file) {
        const type = manifest.recordingTypes?.[session.id] || 'application/octet-stream';
        if (typeof type !== 'string' || !(type === 'application/octet-stream' || /^audio\/[a-z0-9.+;-]+$/i.test(type))) throw new Error('Invalid backup recording format.');
        const bytes = await file.async('arraybuffer');
        if (!bytes.byteLength || (type === 'application/octet-stream' && bytes.byteLength % 4)) throw new Error('Invalid backup audio data.');
        recordings.push({ id: session.id, blob: new Blob([bytes], { type }) });
      }
      onProgress?.({ stage: 'recordings', current: recordings.length, total: sessions.length });
    }
    const customSamples: db.CustomSampleRecord[] = [];
    for (const meta of customMetadata) {
      const file = zip.file(`customsamples/${meta.id.replace('custom:', '')}.wav`);
      if (!file) throw new Error('Invalid backup: a custom sample is missing.');
      customSamples.push({ ...meta, blob: new Blob([await file.async('arraybuffer')], { type: 'audio/wav' }) });
    }
    // Parsing failures and quota errors leave the existing database unchanged.
    const result = await db.restoreBackup({ settings, projects, sessions, presets, profiles, events, recordings, customSamples }, options.restoreSettings !== false);
    onProgress?.({ stage: 'done', current: 1, total: 1 });
    return result;
  } finally { release(); }
}

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  usedPct: number;
  usedLabel: string;
  quotaLabel: string;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    return {
      usedBytes: used,
      quotaBytes: quota,
      usedPct: quota > 0 ? (used / quota) * 100 : 0,
      usedLabel: formatBytes(used),
      quotaLabel: formatBytes(quota),
    };
  }
  return { usedBytes: 0, quotaBytes: 0, usedPct: 0, usedLabel: '—', quotaLabel: '—' };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
