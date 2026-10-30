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
import { hydrateStores, flushPersistence, stopPersistence, startPersistence } from '../../store/persistence';
import { beginCriticalActivity, isCriticalActivityActive } from '../../utils/critical-activity';
import * as db from '../../store/db';
import { HelpTip } from '../ui/HelpTip';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { SettingRow } from '../ui/SettingRow';
import { Toggle } from '../ui/Toggle';

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
  const [restoreSettings, setRestoreSettings] = useState(true);
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
      const success = includeRecordings ? 'Full backup created.' : 'Data-only backup created. Recordings were not included.';
      setMessage(success);
      try {
        await db.setSetting('lastBackupAt', new Date().toISOString());
        await db.setSetting('sessionsSinceBackup', 0);
        await db.setSetting('backupThreshold', 10);
      } catch {
        setMessage(`${success} The backup reminder could not be reset; your downloaded backup is ready.`);
      }
      window.dispatchEvent(new Event('polypro:backup-status-changed'));
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
      if (isCriticalActivityActive()) throw new Error('Finish the current recording, analysis or data operation first.');
      await flushPersistence();
      stopPersistence();
      const result = await importBackup(importFile, setProgress, { restoreSettings });
      await hydrateStores();
      await Promise.all([loadSessions(), loadProjects(), loadInstruments()]);
      await refreshStorage();
      setMessage(`Imported ${result.imported.projects} projects and ${result.imported.sessions} sessions; skipped ${result.skipped} duplicates.`);
      setImportFile(null);
      setImportPreview(null);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed');
    } finally {
      startPersistence();
      setState('idle');
      setProgress(null);
    }
  }, [restoreSettings, importFile, loadSessions, loadProjects, loadInstruments, refreshStorage]);

  const handleDeleteAll = useCallback(async () => {
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation first.'); return; }
    const release = beginCriticalActivity('data');
    setState('deleting');
    setError(null);
    try {
      await db.clearAllData();
      useMetronomeStore.setState(useMetronomeStore.getInitialState(), true);
      useSettingsStore.setState(useSettingsStore.getInitialState(), true);
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
    if (isCriticalActivityActive()) { setError('Finish the current recording, analysis or data operation first.'); return; }
    const release = beginCriticalActivity('data');
    try {
      await db.removeSessionData(sessionId, true);
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
    ...projects.map((project) => ({ id: project.id, label: project.name, sessions: sessions.filter((session) => session.projectId === project.id) })),
    { id: '__quick', label: 'Quick Start', sessions: sessions.filter((session) => session.projectId === null) },
  ].filter((group) => group.sessions.length > 0);

  const busy = state !== 'idle';
  const recordingCount = sessions.filter((session) => session.hasRecording).length;

  return (
    <div className="space-y-6">
      <section aria-labelledby="data-storage" className="space-y-3">
        <h3 id="data-storage" className="text-sm font-semibold text-text-primary">On this device</h3>
        {storageInfo && (
          <div className="ui-field">
            <div className="flex items-center justify-between">
              <span className="ui-label flex items-center gap-2">Storage used <HelpTip text="Recordings use most local storage. Poly Pro asks the browser to keep its data, but regular backups are still the safe choice." /></span>
              <span className="text-sm tabular-nums text-text-secondary">{storageInfo.usedLabel} of {storageInfo.quotaLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-raised" role="progressbar" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(storageInfo.usedPct)}>
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, storageInfo.usedPct)}%` }} />
            </div>
          </div>
        )}
        <p className="text-sm tabular-nums text-text-secondary">
          {projects.length} project{projects.length === 1 ? '' : 's'} · {sessions.length} take{sessions.length === 1 ? '' : 's'} · {recordingCount} with audio
        </p>
        {!isPersistent && (
          <SettingRow label="Keep data when storage is low" description="Asks the browser not to clear Poly Pro automatically.">
            <Button variant="secondary" onClick={async () => setIsPersistent(await requestPersistentStorage())}>Allow</Button>
          </SettingRow>
        )}
      </section>

      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {busy && state !== 'preview' && <p className="text-sm text-text-secondary" role="status">{progressLabel || 'Working…'}</p>}

      <section aria-labelledby="data-backup" className="space-y-3">
        <h3 id="data-backup" className="text-sm font-semibold text-text-primary">Backup and restore</h3>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void runExport(true)}>Full backup</Button>
          <Button variant="secondary" disabled={busy} onClick={() => void runExport(false)}>Data-only backup</Button>
        </div>
        <p className="ui-hint">Data-only leaves out recording audio but keeps projects, takes, settings, hit data, instrument profiles and custom samples.</p>
        <Button variant="secondary" block disabled={busy} onClick={() => fileInputRef.current?.click()}>Import backup</Button>
        <input ref={fileInputRef} type="file" accept=".polypro" className="hidden" onChange={handleFileSelect} />

        {state === 'preview' && importPreview && (
          <div className="ui-surface space-y-2 p-4">
            <p className="text-sm font-semibold text-text-primary">Import preview</p>
            <p className="text-sm text-text-secondary">{importPreview.newProjects} new projects · {importPreview.newSessions} new sessions</p>
            <p className="ui-hint">{importPreview.duplicateProjects + importPreview.duplicateSessions} duplicates will be skipped. Existing items are never overwritten.</p>
            <SettingRow label="Restore settings and active project">
              <Toggle label="Restore backed-up settings and active project" enabled={restoreSettings} onChange={setRestoreSettings} />
            </SettingRow>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { setState('idle'); setImportPreview(null); setImportFile(null); }}>Cancel</Button>
              <Button variant="primary" onClick={() => void handleImport()}>Import</Button>
            </div>
          </div>
        )}
      </section>

      {sessionGroups.length > 0 && (
        <section aria-labelledby="data-audio" className="space-y-2">
          <h3 id="data-audio" className="text-sm font-semibold text-text-primary">Recording audio</h3>
          <p className="ui-hint">Remove audio to free space. Scores and hit data are kept.</p>
          <div className="ui-rows border-y border-border-subtle">
            {sessionGroups.map((group) => (
              <div key={group.id}>
                <button type="button" aria-expanded={expandedProject === group.id} onClick={() => setExpandedProject(expandedProject === group.id ? null : group.id)} className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left text-sm text-text-primary">
                  <span className="truncate">{group.label}</span>
                  <span className="shrink-0 text-text-muted tabular-nums">{group.sessions.filter((session) => session.hasRecording).length} with audio</span>
                </button>
                {expandedProject === group.id && (
                  <div className="pb-2">
                    {group.sessions.map((session) => (
                      <div key={session.id} className="flex min-h-[44px] items-center gap-2 pl-3 text-sm text-text-secondary">
                        <span className="flex-1 truncate tabular-nums">{new Date(session.date).toLocaleDateString()} · {session.bpm} BPM</span>
                        {session.hasRecording
                          ? <Button variant="danger-quiet" className="min-h-[36px] px-3 text-xs" onClick={() => void handleDeleteAudio(session.id)}>Delete audio</Button>
                          : <span className="text-xs text-text-muted">No audio</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {showDeleteConfirm ? (
        <div role="alertdialog" aria-label="Delete all Poly Pro data" className="ui-notice ui-notice-danger space-y-3">
          <p className="font-semibold">Delete all Poly Pro data on this device?</p>
          <p className="text-text-primary">This removes settings, projects, takes, recordings, hit data, presets, custom samples and instrument profiles. It cannot be undone.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" disabled={state === 'deleting'} onClick={() => void handleDeleteAll()}>{state === 'deleting' ? 'Deleting…' : 'Delete everything'}</Button>
          </div>
        </div>
      ) : (
        <Button variant="danger-quiet" block disabled={busy} onClick={() => setShowDeleteConfirm(true)}>Delete all data</Button>
      )}
    </div>
  );
}
