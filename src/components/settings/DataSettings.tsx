/**
 * DataSettings — Phase 10
 *
 * Settings > Data section with:
 * - Storage usage bar + quota
 * - Export backup → .polypro download
 * - Import backup → file picker + preview + restore
 * - Per-project storage breakdown
 * - Delete all data (with confirmation)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSessionStore } from '../../store/session-store';
import { useProjectStore } from '../../store/project-store';
import { useInstrumentStore } from '../../store/instrument-store';
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
import * as db from '../../store/db';
import { HelpTip } from '../ui/HelpTip';

type DataState = 'idle' | 'exporting' | 'importing' | 'preview' | 'deleting';

export function DataSettings() {
  const sessions = useSessionStore((s) => s.sessions);
  const projects = useProjectStore((s) => s.projects);
  const loadSessions = useSessionStore((s) => s.loadFromDB);
  const loadProjects = useProjectStore((s) => s.loadFromDB);
  const loadInstruments = useInstrumentStore((s) => s.loadFromDB);

  const [state, setState] = useState<DataState>('idle');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showProjectBreakdown, setShowProjectBreakdown] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load storage info on mount
  useEffect(() => {
    getStorageInfo().then(setStorageInfo);
    navigator.storage?.persisted?.().then((p) => setIsPersistent(p));
  }, []);

  // ─── Export ───

  const handleExport = useCallback(async () => {
    setState('exporting');
    setError(null);
    setProgress(null);

    try {
      const blob = await exportBackup((p) => setProgress(p));
      downloadBackup(blob);
      setState('idle');

      // Record backup timestamp
      await db.setSetting('lastBackupAt', new Date().toISOString());
      await db.setSetting('sessionsSinceBackup', 0);
    } catch (err) {
      console.error('Export failed:', err);
      setError(err instanceof Error ? err.message : 'Export failed');
      setState('idle');
    }
  }, []);

  // ─── Import ───

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState('preview');
    setError(null);

    try {
      const preview = await previewBackup(file);
      setImportPreview(preview);
      setImportFile(file);
    } catch (err) {
      console.error('Preview failed:', err);
      setError(err instanceof Error ? err.message : 'Invalid backup file');
      setState('idle');
    }

    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const handleImportConfirm = useCallback(async () => {
    if (!importFile) return;

    setState('importing');
    setError(null);
    setProgress(null);

    try {
      const result = await importBackup(importFile, (p) => setProgress(p));
      setImportResult(
        `Imported ${result.imported.projects} projects, ${result.imported.sessions} sessions. ` +
        `${result.skipped} duplicates skipped.`,
      );

      // Reload stores
      await loadSessions();
      await loadProjects();
      await loadInstruments();

      // Refresh storage info
      const info = await getStorageInfo();
      setStorageInfo(info);

      setState('idle');
      setImportPreview(null);
      setImportFile(null);
    } catch (err) {
      console.error('Import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed');
      setState('idle');
    }
  }, [importFile, loadSessions, loadProjects, loadInstruments]);

  const handleCancelImport = useCallback(() => {
    setState('idle');
    setImportPreview(null);
    setImportFile(null);
  }, []);

  // ─── Delete All ───

  const handleDeleteAll = useCallback(async () => {
    setState('deleting');
    try {
      // Delete all data from IDB
      const allSessions = await db.getAllSessions();
      for (const s of allSessions) {
        await db.deleteSession(s.id);
        await db.deleteRecording(s.id);
        await db.deleteHitEvents(s.id);
      }
      const allProjects = await db.getAllProjects();
      for (const p of allProjects) {
        await db.deleteProject(p.id);
      }
      const allPresets = await db.getAllPresets();
      for (const p of allPresets) {
        await db.deletePreset(p.id);
      }
      await db.clearAllInstrumentProfiles();

      // Reload stores
      await loadSessions();
      await loadProjects();
      await loadInstruments();

      const info = await getStorageInfo();
      setStorageInfo(info);

      setState('idle');
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('Delete failed:', err);
      setError(err instanceof Error ? err.message : 'Delete failed');
      setState('idle');
    }
  }, [loadSessions, loadProjects, loadInstruments]);

  // ─── Persistent Storage ───

  const handlePersist = useCallback(async () => {
    const granted = await requestPersistentStorage();
    setIsPersistent(granted);
  }, []);

  // ─── Project storage breakdown ───

  const projectBreakdown = projects.map((p) => {
    const projectSessions = sessions.filter((s) => s.projectId === p.id);
    return {
      name: p.name,
      icon: p.icon,
      sessions: projectSessions.length,
    };
  });

  const orphanSessions = sessions.filter((s) => !s.projectId);

  // ─── Progress label ───

  const progressLabel = progress
    ? {
        settings: 'Packaging settings…',
        projects: 'Packaging projects…',
        sessions: 'Packaging sessions…',
        hitevents: `Packaging onset data (${progress.current}/${progress.total})…`,
        recordings: `Packaging recordings (${progress.current}/${progress.total})…`,
        profiles: 'Packaging instrument profiles…',
        zipping: 'Compressing…',
        done: 'Done',
      }[progress.stage]
    : '';

  return (
    <div className="space-y-4">
      {/* Storage bar */}
      {storageInfo && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-secondary flex items-center gap-1">
              Storage
              <HelpTip text="How much device storage the app is using. Recordings are the largest data. You can free space by deleting audio-only from old sessions." />
            </span>
            <span className="text-xs font-mono text-text-muted">
              {storageInfo.usedLabel} / {storageInfo.quotaLabel}
            </span>
          </div>
          <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, storageInfo.usedPct)}%`,
                backgroundColor:
                  storageInfo.usedPct >= 90 ? '#F87171' :
                  storageInfo.usedPct >= 80 ? '#FBBF24' :
                  '#4ADE80',
              }}
            />
          </div>
          {storageInfo.usedPct >= 80 && (
            <p className={`text-xs mt-1 ${storageInfo.usedPct >= 90 ? 'text-danger' : 'text-warning'}`}>
              {storageInfo.usedPct >= 90
                ? 'Storage critically low — delete old recordings to free space'
                : 'Storage getting full — consider exporting and cleaning up'}
            </p>
          )}
        </div>
      )}

      {/* Persistent storage toggle */}
      {!isPersistent && (
        <button
          onClick={handlePersist}
          className="w-full text-left text-xs text-text-muted py-1"
        >
          Enable persistent storage (prevents browser from clearing data) →
        </button>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span>{sessions.length} sessions</span>
        <span>{projects.length} projects</span>
        <span>{sessions.filter((s) => s.hasRecording).length} recordings</span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger-dim border border-danger/30 rounded-md p-2">
          <p className="text-danger text-xs">{error}</p>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div className="bg-success-dim border border-success/30 rounded-md p-2">
          <p className="text-success text-xs">{importResult}</p>
          <button onClick={() => setImportResult(null)} className="text-success/60 text-[10px] mt-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={state !== 'idle'}
        className={`w-full py-2.5 rounded-md text-sm min-h-[44px] transition-colors ${
          state !== 'idle'
            ? 'bg-bg-raised text-text-muted cursor-not-allowed'
            : 'bg-bg-raised border border-border-subtle text-text-primary hover:bg-border-subtle'
        }`}
      >
        {state === 'exporting' ? progressLabel : 'Export Backup'}
      </button>

      {/* Import button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={state !== 'idle'}
        className={`w-full py-2.5 rounded-md text-sm min-h-[44px] transition-colors ${
          state !== 'idle'
            ? 'bg-bg-raised text-text-muted cursor-not-allowed'
            : 'bg-bg-raised border border-border-subtle text-text-primary hover:bg-border-subtle'
        }`}
      >
        Import Backup
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".polypro"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Import preview */}
      {state === 'preview' && importPreview && (
        <div className="bg-bg-surface border border-border-subtle rounded-md p-3 space-y-2">
          <p className="text-xs text-text-primary font-medium">Import Preview</p>
          <p className="text-xs text-text-secondary">
            Backup from {new Date(importPreview.manifest.createdAt).toLocaleDateString()}
          </p>
          <div className="text-xs text-text-muted space-y-0.5">
            <p>New projects: {importPreview.newProjects}</p>
            <p>New sessions: {importPreview.newSessions}</p>
            {importPreview.duplicateProjects + importPreview.duplicateSessions > 0 && (
              <p className="text-text-muted">
                {importPreview.duplicateProjects + importPreview.duplicateSessions} duplicates will be skipped
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleCancelImport}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleImportConfirm}
              className="flex-1 py-2 bg-accent text-bg-primary rounded-md text-xs font-medium min-h-[44px]"
            >
              Import
            </button>
          </div>
        </div>
      )}

      {/* Import progress */}
      {state === 'importing' && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          <span className="text-xs text-text-secondary">{progressLabel}</span>
        </div>
      )}

      {/* Project breakdown */}
      <button
        onClick={() => setShowProjectBreakdown(!showProjectBreakdown)}
        className="text-xs text-text-muted underline"
      >
        {showProjectBreakdown ? 'Hide breakdown' : 'Storage by project'}
      </button>

      {showProjectBreakdown && (
        <div className="space-y-1">
          {projectBreakdown.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between py-1.5 px-2 bg-bg-surface rounded-sm"
            >
              <span className="text-xs text-text-primary">
                {p.icon} {p.name}
              </span>
              <span className="text-xs text-text-muted font-mono">
                {p.sessions} sessions
              </span>
            </div>
          ))}
          {orphanSessions.length > 0 && (
            <div className="flex items-center justify-between py-1.5 px-2 bg-bg-surface rounded-sm">
              <span className="text-xs text-text-muted">No project</span>
              <span className="text-xs text-text-muted font-mono">
                {orphanSessions.length} sessions
              </span>
            </div>
          )}
        </div>
      )}

      {/* Delete all */}
      {showDeleteConfirm ? (
        <div className="bg-danger-dim border border-danger/30 rounded-md p-3 space-y-2">
          <p className="text-danger text-xs font-medium">
            Delete all sessions, projects, presets, and instrument profiles?
          </p>
          <p className="text-danger/70 text-[10px]">
            This cannot be undone. Export a backup first if needed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 py-2 border border-border-subtle text-text-secondary rounded-md text-xs min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteAll}
              disabled={state === 'deleting'}
              className="flex-1 py-2 bg-danger text-white rounded-md text-xs font-medium min-h-[44px]"
            >
              {state === 'deleting' ? 'Deleting…' : 'Delete Everything'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={state !== 'idle'}
          className="w-full py-2 text-danger text-xs min-h-[44px]"
        >
          Delete All Data
        </button>
      )}
    </div>
  );
}
