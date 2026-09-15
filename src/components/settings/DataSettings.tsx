import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionStore } from '../../store/session-store';
import { useProjectStore } from '../../store/project-store';
import { useInstrumentStore } from '../../store/instrument-store';
import { useMetronomeStore } from '../../store/metronome-store';
import { useSettingsStore } from '../../store/settings-store';
import {
  exportBackup,
  downloadBackup,
  previewBackup,
  importBackup,
  getStorageInfo,
  requestPersistentStorage,
  type StorageInfo,
  type ImportPreview,
  type ExportProgress,
} from '../../utils/backup';
import { beginCriticalActivity } from '../../utils/critical-activity';
import * as db from '../../store/db';
import { HelpTip } from '../ui/HelpTip';

type DataState = 'idle' | 'exporting-full' | 'exporting-data' | 'preview' | 'importing' | 'deleting';

export function DataSettings() {
  const sessions = useSessionStore((state) => state.sessions);
  const projects = useProjectStore((state) => state.projects);
  const loadSessions = useSessionStore((state) => state.loadFromDB);
  const loadProjects = useProjectStore((state) => state.loadFromDB);
  const loadInstruments = useInstrumentStore((state) => state.loadFromDB);
  const [state, setState] = useState<DataState>('idle');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStorage = useCallback(async () => {
    setStorageInfo(await getStorageInfo());
  }, []);

  useEffect(() => {
    void refreshStorage();
    navigator.storage?.persisted?.().then(setIsPersistent).catch(() => {});
  }, [refreshStorage]);

  const runExport = useCallback(async (includeRecordings: boolean) => {
    setState(includeRecordings ? 'exporting-full' : 'exporting-data');
    setProgress(null);
    setError(null);
    setMessage(null);
    try {
      const blob = await exportBackup(setProgress, { includeRecordings });
      downloadBackup(blob, includeRecordings ? 'full' : 'data-only');
      await db.setSetting('lastBackupAt', new Date().toISOString());
      await db.setSetting('sessionsSinceBackup', 0);
      setMessage(includeRecordings ? 'Full backup created.' : 'Data-only backup created. Recordings were not included.');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Backup failed');
    } finally {
      setState('idle');
      setProgress(null);
    }
  }, []);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setState('preview');
    setError(null);
    setMessage(null);
    try {
      setImportPreview(await previewBackup(file));
      setImportFile(file);
    } catch (previewError) {
      setState('idle');
      setError(previewError instanceof Error ? previewError.message : 'Invalid backup');
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importFile) return;
    setState('importing');
    setProgress(null);
    setError(null);
    try {
      const result = await importBackup(importFile, setProgress);
      await Promise.all([loadSessions(), loadProjects(), loadInstruments()]);
      await refreshStorage();
      setMessage(`Imported ${result.imported.projects} projects and ${result.imported.sessions} sessions; skipped ${result.skipped} duplicates.`);
      setImportFile(null);
      setImportPreview(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed');
    } finally {
      setState('idle');
      setProgress(null);
    }
  }, [importFile, loadSessions, loadProjects, loadInstruments, refreshStorage]);

  const handleDeleteAll = useCallback(async () => {
    const release = beginCriticalActivity('data');
    setState('deleting');
    setError(null);
    try {
      await db.clearAllData();
      useMetronomeStore.getState().resetToDefaults();
      useSettingsStore.getState().resetToDefaults();
      await Promise.all([loadSessions(), loadProjects(), loadInstruments()]);
      await refreshStorage();
      setShowDeleteConfirm(false);
      setMessage('All Poly Pro local data was deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Delete failed');
    } finally {
      release();
      setState('idle');
    }
  }, [loadSessions, loadProjects, loadInstruments, refreshStorage]);

  const handleDeleteAudio = useCallback(async (sessionId: string) => {
    const release = beginCriticalActivity('data');
    try {
      await db.deleteRecording(sessionId);
      const session = sessions.find((item) => item.id === sessionId);
      if (session) await db.putSession({ ...session, hasRecording: false });
      await loadSessions();
      await refreshStorage();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete recording audio');
    } finally {
      release();
    }
  }, [sessions, loadSessions, refreshStorage]);

  const progressLabel = progress ? ({
    settings: 'Settings…', projects: 'Projects…', sessions: 'Sessions…',
    hitevents: `Hit data ${progress.current}/${progress.total}`,
    recordings: `Recordings ${progress.current}/${progress.total}`,
    profiles: 'Instrument profiles…', zipping: 'Compressing…', done: 'Done',
  } as const)[progress.stage] : '';

  const sessionGroups = [
    ...projects.map((project) => ({ id: project.id, label: `${project.icon} ${project.name}`, sessions: sessions.filter((session) => session.projectId === project.id) })),
    { id: '__quick', label: 'Quick Start', sessions: sessions.filter((session) => session.projectId === null) },
  ].filter((group) => group.sessions.length > 0);

  return (
    <div className="space-y-4 pt-3">
      {storageInfo && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary flex items-center gap-1">Storage <HelpTip text="Recordings use most local storage. Poly Pro requests persistent browser storage but still recommends regular backups." /></span>
            <span className="text-xs font-mono text-text-muted">{storageInfo.usedLabel} / {storageInfo.quotaLabel}</span>
          </div>
          <div className="h-2 rounded-full bg-bg-raised overflow-hidden" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(storageInfo.usedPct)}>
            <div className="h-full bg-accent" style={{ width: `${Math.min(100, storageInfo.usedPct)}%` }} />
          </div>
        </div>
      )}

      {!isPersistent && (
        <button type="button" className="w-full min-h-[40px] text-left text-xs text-text-muted" onClick={async () => setIsPersistent(await requestPersistentStorage())}>
          Enable persistent storage →
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Projects" value={projects.length} />
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Recordings" value={sessions.filter((session) => session.hasRecording).length} />
      </div>

      {error && <div role="alert" className="rounded-lg border border-danger/30 bg-danger-dim p-2 text-xs text-danger">{error}</div>}
      {message && <div role="status" className="rounded-lg border border-success/30 bg-success-dim p-2 text-xs text-success">{message}</div>}
      {state !== 'idle' && state !== 'preview' && <p className="text-xs text-text-muted" role="status">{progressLabel || 'Working…'}</p>}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={state !== 'idle'} onClick={() => void runExport(true)} className="min-h-[46px] rounded-lg border border-border-subtle bg-bg-surface text-xs font-semibold text-text-primary disabled:opacity-40">Full Backup</button>
        <button type="button" disabled={state !== 'idle'} onClick={() => void runExport(false)} className="min-h-[46px] rounded-lg border border-border-subtle bg-bg-surface text-xs font-semibold text-text-primary disabled:opacity-40">Data-only Backup</button>
      </div>
      <p className="text-[10px] text-text-muted">Data-only backup includes projects, sessions, settings, hit data, instrument profiles, and custom samples, but omits large recording audio.</p>

      <button type="button" disabled={state !== 'idle'} onClick={() => fileInputRef.current?.click()} className="w-full min-h-[46px] rounded-lg border border-border-subtle bg-bg-surface text-xs font-semibold text-text-primary disabled:opacity-40">Import Backup</button>
      <input ref={fileInputRef} type="file" accept=".polypro" className="hidden" onChange={handleFileSelect} />

      {state === 'preview' && importPreview && (
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-3 space-y-2">
          <p className="text-xs font-semibold text-text-primary">Import preview</p>
          <p className="text-[11px] text-text-secondary">{importPreview.newProjects} new projects · {importPreview.newSessions} new sessions</p>
          <p className="text-[10px] text-text-muted">{importPreview.duplicateProjects + importPreview.duplicateSessions} duplicates will be skipped. Existing IDs are never overwritten.</p>
          <div className="flex gap-2">
            <button type="button" className="flex-1 min-h-[42px] rounded-lg border border-border-subtle text-xs text-text-secondary" onClick={() => { setState('idle'); setImportPreview(null); setImportFile(null); }}>Cancel</button>
            <button type="button" className="flex-1 min-h-[42px] rounded-lg bg-accent text-xs font-semibold text-bg-primary" onClick={() => void handleImport()}>Import</button>
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Recording storage</p>
        <div className="space-y-1">
          {sessionGroups.map((group) => (
            <div key={group.id} className="rounded-lg border border-border-subtle bg-bg-surface">
              <button type="button" aria-expanded={expandedProject === group.id} onClick={() => setExpandedProject(expandedProject === group.id ? null : group.id)} className="w-full min-h-[42px] px-3 flex items-center justify-between text-xs text-text-secondary">
                <span>{group.label}</span><span>{group.sessions.filter((session) => session.hasRecording).length} audio</span>
              </button>
              {expandedProject === group.id && (
                <div className="border-t border-border-subtle px-2 py-1 space-y-1">
                  {group.sessions.map((session) => (
                    <div key={session.id} className="flex items-center gap-2 min-h-[36px] text-[10px] text-text-muted">
                      <span className="flex-1 truncate">{new Date(session.date).toLocaleDateString()} · {session.bpm} BPM</span>
                      {session.hasRecording ? <button type="button" onClick={() => void handleDeleteAudio(session.id)} className="min-h-[32px] px-2 text-warning">Delete audio</button> : <span>No audio</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showDeleteConfirm ? (
        <div role="alertdialog" aria-label="Delete all Poly Pro data" className="rounded-lg border border-danger/30 bg-danger-dim p-3 space-y-2">
          <p className="text-xs font-semibold text-danger">Delete all local Poly Pro data?</p>
          <p className="text-[10px] text-danger/80">This clears settings, projects, sessions, recording chunks, hit data, presets, custom samples, profiles, and cloud-consent/cache records. It cannot be undone.</p>
          <div className="flex gap-2">
            <button type="button" className="flex-1 min-h-[42px] rounded-lg border border-border-subtle text-xs text-text-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            <button type="button" disabled={state === 'deleting'} className="flex-1 min-h-[42px] rounded-lg bg-danger text-xs font-semibold text-white" onClick={() => void handleDeleteAll()}>{state === 'deleting' ? 'Deleting…' : 'Delete Everything'}</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={state !== 'idle'} onClick={() => setShowDeleteConfirm(true)} className="w-full min-h-[44px] text-xs text-danger disabled:opacity-40">Delete All Data</button>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-border-subtle bg-bg-surface p-2"><p className="text-[9px] text-text-muted">{label}</p><p className="font-mono text-sm text-text-primary">{value}</p></div>;
}
