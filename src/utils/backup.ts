/**
 * Backup Utilities — Phase 10
 *
 * Export: packages all IDB data into a .polypro zip file.
 * Import: reads .polypro zip and restores data to IDB.
 *
 * Zip structure:
 *   manifest.json — version, date, counts
 *   settings.json — all settings
 *   projects.json — all projects
 *   sessions.json — all session records
 *   profiles.json — instrument profiles
 *   hitevents/  — one JSON per session (hitevents:{sessionId}.json)
 *   recordings/ — one bin per session (raw PCM blobs, if present)
 */

import * as db from '../store/db';

// JSZip loaded lazily to keep main bundle small (~120KB)
async function getJSZip() {
  const mod = await import('jszip');
  return mod.default;
}

// ─── Types ───

export interface BackupManifest {
  version: 2;
  format: 'polypro-backup';
  createdAt: string;
  appVersion: string;
  counts: {
    projects: number;
    sessions: number;
    recordings: number;
    profiles: number;
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

// ─── Export ───

/**
 * Export all app data to a .polypro zip file.
 */
export async function exportBackup(
  onProgress?: (p: ExportProgress) => void,
): Promise<Blob> {
  const JSZip = await getJSZip();
  const zip = new JSZip();

  // 1. Settings
  onProgress?.({ stage: 'settings', current: 0, total: 1 });
  const settingsKeys = [
    'metronome', 'settings', 'calibratedOffset', 'manualAdjustment',
    'lastCalibratedAt', 'calibrationConsistency',
  ];
  const settings: Record<string, unknown> = {};
  for (const key of settingsKeys) {
    const val = await db.getSetting(key);
    if (val !== undefined) settings[key] = val;
  }
  zip.file('settings.json', JSON.stringify(settings, null, 2));

  // 2. Projects
  onProgress?.({ stage: 'projects', current: 0, total: 1 });
  const projects = await db.getAllProjects();
  zip.file('projects.json', JSON.stringify(projects, null, 2));

  // 3. Sessions
  onProgress?.({ stage: 'sessions', current: 0, total: 1 });
  const sessions = await db.getAllSessions();
  zip.file('sessions.json', JSON.stringify(sessions, null, 2));

  // 4. Instrument profiles
  onProgress?.({ stage: 'profiles', current: 0, total: 1 });
  const profiles = await db.getAllInstrumentProfiles();
  zip.file('profiles.json', JSON.stringify(profiles, null, 2));

  // 5. Hit events (per session)
  const hiteventsFolder = zip.folder('hitevents')!;
  for (let i = 0; i < sessions.length; i++) {
    onProgress?.({ stage: 'hitevents', current: i, total: sessions.length });
    const events = await db.getHitEvents(sessions[i].id);
    if (events) {
      hiteventsFolder.file(`${sessions[i].id}.json`, JSON.stringify(events));
    }
  }

  // 6. Recordings (raw PCM blobs)
  const recordingsFolder = zip.folder('recordings')!;
  let recordingCount = 0;
  for (let i = 0; i < sessions.length; i++) {
    onProgress?.({ stage: 'recordings', current: i, total: sessions.length });
    if (sessions[i].hasRecording) {
      const blob = await db.getRecording(sessions[i].id);
      if (blob) {
        const buffer = await blob.arrayBuffer();
        recordingsFolder.file(`${sessions[i].id}.pcm`, buffer);
        recordingCount++;
      }
    }
  }

  // 7. Manifest
  const manifest: BackupManifest = {
    version: 2,
    format: 'polypro-backup',
    createdAt: new Date().toISOString(),
    appVersion: '2.0.0',
    counts: {
      projects: projects.length,
      sessions: sessions.length,
      recordings: recordingCount,
      profiles: profiles.length,
    },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  // 8. Generate zip
  onProgress?.({ stage: 'zipping', current: 0, total: 1 });
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  onProgress?.({ stage: 'done', current: 1, total: 1 });
  return blob;
}

/**
 * Trigger download of a backup file.
 */
export function downloadBackup(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `polypro-backup-${new Date().toISOString().slice(0, 10)}.polypro`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Import ───

/**
 * Preview a backup file before importing.
 */
export async function previewBackup(file: File): Promise<ImportPreview> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);

  // Read manifest
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('Invalid backup: no manifest.json');
  const manifest: BackupManifest = JSON.parse(await manifestFile.async('text'));

  if (manifest.format !== 'polypro-backup') {
    throw new Error('Invalid backup format');
  }

  // Read projects + sessions to check for duplicates
  const projectsFile = zip.file('projects.json');
  const sessionsFile = zip.file('sessions.json');

  const backupProjects: db.ProjectRecord[] = projectsFile
    ? JSON.parse(await projectsFile.async('text'))
    : [];
  const backupSessions: db.SessionRecord[] = sessionsFile
    ? JSON.parse(await sessionsFile.async('text'))
    : [];

  // Check existing data
  const existingProjects = await db.getAllProjects();
  const existingSessions = await db.getAllSessions();

  const existingProjectIds = new Set(existingProjects.map((p) => p.id));
  const existingSessionIds = new Set(existingSessions.map((s) => s.id));

  const duplicateProjects = backupProjects.filter((p) => existingProjectIds.has(p.id)).length;
  const duplicateSessions = backupSessions.filter((s) => existingSessionIds.has(s.id)).length;

  return {
    manifest,
    newProjects: backupProjects.length - duplicateProjects,
    newSessions: backupSessions.length - duplicateSessions,
    duplicateProjects,
    duplicateSessions,
  };
}

/**
 * Import a backup file into the app.
 * Existing data is NOT overwritten — duplicates are skipped.
 */
export async function importBackup(
  file: File,
  onProgress?: (p: ExportProgress) => void,
): Promise<{ imported: { projects: number; sessions: number }; skipped: number }> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);

  let importedProjects = 0;
  let importedSessions = 0;
  let skipped = 0;

  // 1. Settings (merge — don't overwrite existing)
  onProgress?.({ stage: 'settings', current: 0, total: 1 });
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    const settings: Record<string, unknown> = JSON.parse(await settingsFile.async('text'));
    for (const [key, value] of Object.entries(settings)) {
      const existing = await db.getSetting(key);
      if (existing === undefined) {
        await db.setSetting(key, value);
      }
    }
  }

  // 2. Projects (skip duplicates)
  onProgress?.({ stage: 'projects', current: 0, total: 1 });
  const projectsFile = zip.file('projects.json');
  if (projectsFile) {
    const projects: db.ProjectRecord[] = JSON.parse(await projectsFile.async('text'));
    const existingProjects = await db.getAllProjects();
    const existingIds = new Set(existingProjects.map((p) => p.id));

    for (const project of projects) {
      if (existingIds.has(project.id)) {
        skipped++;
      } else {
        await db.putProject(project);
        importedProjects++;
      }
    }
  }

  // 3. Sessions (skip duplicates)
  const sessionsFile = zip.file('sessions.json');
  const sessions: db.SessionRecord[] = sessionsFile
    ? JSON.parse(await sessionsFile.async('text'))
    : [];

  const existingSessions = await db.getAllSessions();
  const existingSessionIds = new Set(existingSessions.map((s) => s.id));

  for (let i = 0; i < sessions.length; i++) {
    onProgress?.({ stage: 'sessions', current: i, total: sessions.length });
    const session = sessions[i];

    if (existingSessionIds.has(session.id)) {
      skipped++;
      continue;
    }

    await db.putSession(session);
    importedSessions++;
  }

  // 4. Hit events
  const hiteventsFolder = zip.folder('hitevents');
  if (hiteventsFolder) {
    const files: Array<{ name: string; file: any }> = [];
    hiteventsFolder.forEach((path, file) => {
      if (path.endsWith('.json')) files.push({ name: path, file });
    });

    for (let i = 0; i < files.length; i++) {
      onProgress?.({ stage: 'hitevents', current: i, total: files.length });
      const sessionId = files[i].name.replace('.json', '');
      if (existingSessionIds.has(sessionId)) continue; // Already exists
      const data = JSON.parse(await files[i].file.async('text'));
      await db.putHitEvents(data);
    }
  }

  // 5. Recordings
  const recordingsFolder = zip.folder('recordings');
  if (recordingsFolder) {
    const files: Array<{ name: string; file: any }> = [];
    recordingsFolder.forEach((path, file) => {
      if (path.endsWith('.pcm')) files.push({ name: path, file });
    });

    for (let i = 0; i < files.length; i++) {
      onProgress?.({ stage: 'recordings', current: i, total: files.length });
      const sessionId = files[i].name.replace('.pcm', '');
      if (existingSessionIds.has(sessionId)) continue;
      const buffer = await files[i].file.async('arraybuffer');
      await db.putRecording(sessionId, new Blob([buffer]));
    }
  }

  // 6. Instrument profiles (merge, don't overwrite)
  onProgress?.({ stage: 'profiles', current: 0, total: 1 });
  const profilesFile = zip.file('profiles.json');
  if (profilesFile) {
    const profiles: db.InstrumentProfileRecord[] = JSON.parse(await profilesFile.async('text'));
    const existingProfiles = await db.getAllInstrumentProfiles();
    const existingNames = new Set(existingProfiles.map((p) => p.name));

    for (const profile of profiles) {
      if (!existingNames.has(profile.name)) {
        await db.putInstrumentProfile(profile);
      }
    }
  }

  onProgress?.({ stage: 'done', current: 1, total: 1 });

  return {
    imported: { projects: importedProjects, sessions: importedSessions },
    skipped,
  };
}

// ─── Storage Info ───

export interface StorageInfo {
  usedBytes: number;
  quotaBytes: number;
  usedPct: number;
  usedLabel: string;
  quotaLabel: string;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const quota = est.quota ?? 0;
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
  if (navigator.storage?.persist) {
    return navigator.storage.persist();
  }
  return false;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
