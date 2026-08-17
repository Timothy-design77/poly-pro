import * as db from '../store/db';
import { acquireCriticalActivity } from './appActivity';
import { OperationCancelledError } from './async';

async function getJSZip() {
  const module = await import('jszip');
  return module.default;
}

const MAX_IMPORT_FILE_BYTES = 1024 * 1024 * 1024;
const DEFAULT_MAX_AUDIO_EXPORT_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_ITEMS = 100_000;

export interface BackupManifest {
  version: 2 | 3;
  format: 'polypro-backup';
  createdAt: string;
  appVersion: string;
  audioIncluded?: boolean;
  sourceAudioBytes?: number;
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

export interface ExportBackupOptions {
  includeRecordings?: boolean;
  maxAudioBytes?: number;
  signal?: AbortSignal;
}

export interface ImportPreview {
  manifest: BackupManifest;
  newProjects: number;
  newSessions: number;
  duplicateProjects: number;
  duplicateSessions: number;
}

export interface ImportBackupOptions {
  signal?: AbortSignal;
}

export class BackupTooLargeError extends Error {
  readonly sourceBytes: number;
  readonly maximumBytes: number;

  constructor(sourceBytes: number, maximumBytes: number) {
    super(
      `Recordings total ${formatBytes(sourceBytes)}, above the safe in-browser export limit of ${formatBytes(maximumBytes)}. Export metadata only or divide the data into smaller date ranges.`,
    );
    this.name = 'BackupTooLargeError';
    this.sourceBytes = sourceBytes;
    this.maximumBytes = maximumBytes;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new OperationCancelledError('backup operation');
}

function validateManifest(manifest: BackupManifest): void {
  if (manifest.format !== 'polypro-backup') throw new Error('Invalid backup format');
  if (manifest.version !== 2 && manifest.version !== 3) {
    throw new Error(`Unsupported backup version: ${String(manifest.version)}`);
  }

  const counts = [
    manifest.counts.projects,
    manifest.counts.sessions,
    manifest.counts.recordings,
    manifest.counts.profiles,
    manifest.counts.customSamples ?? 0,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0 || count > MAX_MANIFEST_ITEMS)) {
    throw new Error('Backup manifest contains invalid item counts');
  }
}

async function readManifest(zip: Awaited<ReturnType<typeof getJSZip>>): Promise<BackupManifest> {
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid backup: no manifest.json');
  const manifest = JSON.parse(await manifestFile.async('text')) as BackupManifest;
  validateManifest(manifest);
  return manifest;
}

export async function exportBackup(
  onProgress?: (progress: ExportProgress) => void,
  options: ExportBackupOptions = {},
): Promise<Blob> {
  const releaseActivity = acquireCriticalActivity('backup-export');
  const includeRecordings = options.includeRecordings ?? true;
  const maxAudioBytes = options.maxAudioBytes ?? DEFAULT_MAX_AUDIO_EXPORT_BYTES;

  try {
    throwIfAborted(options.signal);
    const JSZip = await getJSZip();
    const zip = new JSZip();

    onProgress?.({ stage: 'settings', current: 0, total: 1 });
    const settingsKeys = [
      'metronome',
      'settings',
      'calibratedOffset',
      'manualAdjustment',
      'lastCalibratedAt',
      'calibrationConsistency',
    ];
    const settings: Record<string, unknown> = {};
    for (const key of settingsKeys) {
      throwIfAborted(options.signal);
      const value = await db.getSetting(key);
      if (value !== undefined) settings[key] = value;
    }
    zip.file('settings.json', JSON.stringify(settings, null, 2));

    onProgress?.({ stage: 'projects', current: 0, total: 1 });
    const projects = await db.getAllProjects();
    zip.file('projects.json', JSON.stringify(projects, null, 2));

    onProgress?.({ stage: 'sessions', current: 0, total: 1 });
    const sessions = await db.getAllSessions();
    zip.file('sessions.json', JSON.stringify(sessions, null, 2));

    onProgress?.({ stage: 'profiles', current: 0, total: 1 });
    const profiles = await db.getAllInstrumentProfiles();
    zip.file('profiles.json', JSON.stringify(profiles, null, 2));

    const hitEventsFolder = zip.folder('hitevents');
    if (!hitEventsFolder) throw new Error('Could not create hit-events archive folder');
    for (let index = 0; index < sessions.length; index += 1) {
      throwIfAborted(options.signal);
      onProgress?.({ stage: 'hitevents', current: index, total: sessions.length });
      const events = await db.getHitEvents(sessions[index].id);
      if (events) hitEventsFolder.file(`${sessions[index].id}.json`, JSON.stringify(events));
    }

    const recordingsFolder = zip.folder('recordings');
    if (!recordingsFolder) throw new Error('Could not create recordings archive folder');
    let recordingCount = 0;
    let sourceAudioBytes = 0;

    if (includeRecordings) {
      for (let index = 0; index < sessions.length; index += 1) {
        throwIfAborted(options.signal);
        onProgress?.({ stage: 'recordings', current: index, total: sessions.length });
        const session = sessions[index];
        if (!session.hasRecording) continue;

        const blob = await db.getRecording(session.id);
        if (!blob) continue;
        sourceAudioBytes += blob.size;
        if (sourceAudioBytes > maxAudioBytes) {
          throw new BackupTooLargeError(sourceAudioBytes, maxAudioBytes);
        }

        // Give JSZip the Blob directly. This avoids eagerly materializing a
        // second ArrayBuffer for every recording before compression begins.
        recordingsFolder.file(`${session.id}.pcm`, blob, {
          binary: true,
          compression: 'DEFLATE',
        });
        recordingCount += 1;
      }
    }

    const customSamples = await db.getAllCustomSamples();
    const customSamplesFolder = zip.folder('customsamples');
    if (!customSamplesFolder) throw new Error('Could not create custom-sample archive folder');
    const customMetadata = customSamples.map((sample) => ({
      id: sample.id,
      name: sample.name,
      durationMs: sample.durationMs,
      createdAt: sample.createdAt,
    }));
    zip.file('customsamples.json', JSON.stringify(customMetadata, null, 2));
    for (const sample of customSamples) {
      throwIfAborted(options.signal);
      customSamplesFolder.file(
        `${sample.id.replace('custom:', '')}.wav`,
        sample.blob,
        { binary: true, compression: 'STORE' },
      );
    }

    const manifest: BackupManifest = {
      version: 3,
      format: 'polypro-backup',
      createdAt: new Date().toISOString(),
      appVersion: '2.0.0',
      audioIncluded: includeRecordings,
      sourceAudioBytes,
      counts: {
        projects: projects.length,
        sessions: sessions.length,
        recordings: recordingCount,
        profiles: profiles.length,
        customSamples: customSamples.length,
      },
    };
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    throwIfAborted(options.signal);
    onProgress?.({ stage: 'zipping', current: 0, total: 1 });
    const blob = await zip.generateAsync({
      type: 'blob',
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    }, (metadata) => {
      throwIfAborted(options.signal);
      onProgress?.({
        stage: 'zipping',
        current: Math.round(metadata.percent),
        total: 100,
      });
    });

    onProgress?.({ stage: 'done', current: 1, total: 1 });
    return blob;
  } finally {
    releaseActivity();
  }
}

export function downloadBackup(blob: Blob, qualifier = 'backup'): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `polypro-${qualifier}-${new Date().toISOString().slice(0, 10)}.polypro`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Allow the browser to begin consuming the URL before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function previewBackup(file: File): Promise<ImportPreview> {
  if (file.size <= 0) throw new Error('Backup file is empty');
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Backup exceeds the ${formatBytes(MAX_IMPORT_FILE_BYTES)} import limit`);
  }

  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file, { checkCRC32: true });
  const manifest = await readManifest(zip);

  const projectsFile = zip.file('projects.json');
  const sessionsFile = zip.file('sessions.json');
  const backupProjects: db.ProjectRecord[] = projectsFile
    ? JSON.parse(await projectsFile.async('text'))
    : [];
  const backupSessions: db.SessionRecord[] = sessionsFile
    ? JSON.parse(await sessionsFile.async('text'))
    : [];

  if (backupProjects.length > MAX_MANIFEST_ITEMS || backupSessions.length > MAX_MANIFEST_ITEMS) {
    throw new Error('Backup contains too many records');
  }

  const existingProjects = await db.getAllProjects();
  const existingSessions = await db.getAllSessions();
  const existingProjectIds = new Set(existingProjects.map((project) => project.id));
  const existingSessionIds = new Set(existingSessions.map((session) => session.id));
  const duplicateProjects = backupProjects.filter(
    (project) => existingProjectIds.has(project.id),
  ).length;
  const duplicateSessions = backupSessions.filter(
    (session) => existingSessionIds.has(session.id),
  ).length;

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
  onProgress?: (progress: ExportProgress) => void,
  options: ImportBackupOptions = {},
): Promise<{ imported: { projects: number; sessions: number }; skipped: number }> {
  const releaseActivity = acquireCriticalActivity('backup-import');

  try {
    throwIfAborted(options.signal);
    if (file.size <= 0) throw new Error('Backup file is empty');
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      throw new Error(`Backup exceeds the ${formatBytes(MAX_IMPORT_FILE_BYTES)} import limit`);
    }

    const JSZip = await getJSZip();
    const zip = await JSZip.loadAsync(file, { checkCRC32: true });
    await readManifest(zip);

    let importedProjects = 0;
    let importedSessions = 0;
    let skipped = 0;

    onProgress?.({ stage: 'settings', current: 0, total: 1 });
    const settingsFile = zip.file('settings.json');
    if (settingsFile) {
      const settings = JSON.parse(await settingsFile.async('text')) as Record<string, unknown>;
      for (const [key, value] of Object.entries(settings)) {
        throwIfAborted(options.signal);
        const existing = await db.getSetting(key);
        if (existing === undefined) await db.setSetting(key, value);
      }
    }

    onProgress?.({ stage: 'profiles', current: 0, total: 1 });
    const profilesFile = zip.file('profiles.json');
    if (profilesFile) {
      const profiles = JSON.parse(await profilesFile.async('text')) as db.InstrumentProfileRecord[];
      const existingProfiles = await db.getAllInstrumentProfiles();
      const existingNames = new Set(existingProfiles.map((profile) => profile.name));
      for (const profile of profiles) {
        throwIfAborted(options.signal);
        if (!existingNames.has(profile.name)) await db.putInstrumentProfile(profile);
      }
    }

    const customMetadataFile = zip.file('customsamples.json');
    if (customMetadataFile) {
      const customMetadata = JSON.parse(await customMetadataFile.async('text')) as Array<{
        id: string;
        name: string;
        durationMs: number;
        createdAt: string;
      }>;
      const existingCustom = await db.getAllCustomSamples();
      const existingIds = new Set(existingCustom.map((sample) => sample.id));
      const folder = zip.folder('customsamples');

      for (const metadata of customMetadata) {
        throwIfAborted(options.signal);
        if (existingIds.has(metadata.id)) continue;
        const archiveFile = folder?.file(`${metadata.id.replace('custom:', '')}.wav`);
        if (!archiveFile) continue;
        const bytes = await archiveFile.async('uint8array');
        await db.putCustomSample({
          ...metadata,
          blob: new Blob([bytes], { type: 'audio/wav' }),
        });
      }
    }

    const sessionsFile = zip.file('sessions.json');
    const sessions = sessionsFile
      ? JSON.parse(await sessionsFile.async('text')) as db.SessionRecord[]
      : [];
    if (sessions.length > MAX_MANIFEST_ITEMS) throw new Error('Backup contains too many sessions');

    const existingSessions = await db.getAllSessions();
    const existingSessionIds = new Set(existingSessions.map((session) => session.id));
    const hitEventsFolder = zip.folder('hitevents');
    const recordingsFolder = zip.folder('recordings');

    // Import each session's dependent data before publishing its metadata. A
    // failed import therefore cannot leave a visible session pointing to a
    // recording that was never restored.
    for (let index = 0; index < sessions.length; index += 1) {
      throwIfAborted(options.signal);
      onProgress?.({ stage: 'sessions', current: index, total: sessions.length });
      const session = sessions[index];
      if (existingSessionIds.has(session.id)) {
        skipped += 1;
        continue;
      }

      const eventsFile = hitEventsFolder?.file(`${session.id}.json`);
      if (eventsFile) {
        onProgress?.({ stage: 'hitevents', current: index, total: sessions.length });
        const events = JSON.parse(await eventsFile.async('text')) as db.HitEventsRecord;
        await db.putHitEvents(events);
      }

      const recordingFile = recordingsFolder?.file(`${session.id}.pcm`);
      if (recordingFile) {
        onProgress?.({ stage: 'recordings', current: index, total: sessions.length });
        const bytes = await recordingFile.async('uint8array');
        await db.putRecording(session.id, new Blob([bytes], {
          type: 'application/octet-stream',
        }));
      }

      await db.putSession({
        ...session,
        hasRecording: Boolean(recordingFile) || session.hasRecording,
      });
      importedSessions += 1;
      existingSessionIds.add(session.id);
    }

    onProgress?.({ stage: 'projects', current: 0, total: 1 });
    const projectsFile = zip.file('projects.json');
    if (projectsFile) {
      const projects = JSON.parse(await projectsFile.async('text')) as db.ProjectRecord[];
      if (projects.length > MAX_MANIFEST_ITEMS) throw new Error('Backup contains too many projects');
      const existingProjects = await db.getAllProjects();
      const existingIds = new Set(existingProjects.map((project) => project.id));
      for (const project of projects) {
        throwIfAborted(options.signal);
        if (existingIds.has(project.id)) {
          skipped += 1;
        } else {
          await db.putProject(project);
          importedProjects += 1;
        }
      }
    }

    onProgress?.({ stage: 'done', current: 1, total: 1 });
    return {
      imported: { projects: importedProjects, sessions: importedSessions },
      skipped,
    };
  } finally {
    releaseActivity();
  }
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
    const usedBytes = estimate.usage ?? 0;
    const quotaBytes = estimate.quota ?? 0;
    return {
      usedBytes,
      quotaBytes,
      usedPct: quotaBytes > 0 ? (usedBytes / quotaBytes) * 100 : 0,
      usedLabel: formatBytes(usedBytes),
      quotaLabel: formatBytes(quotaBytes),
    };
  }
  return {
    usedBytes: 0,
    quotaBytes: 0,
    usedPct: 0,
    usedLabel: '—',
    quotaLabel: '—',
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  return navigator.storage?.persist ? navigator.storage.persist() : false;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
