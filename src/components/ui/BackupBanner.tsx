/**
 * BackupBanner — Phase 10
 *
 * Dismissible banner shown on Home page when user has recorded
 * 10+ sessions since last backup.
 *
 * "Remind me later" = +5 sessions threshold.
 * "Don't remind me" = permanent dismiss.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSessionStore } from '../../store/session-store';
import * as db from '../../store/db';

export function BackupBanner() {
  const sessions = useSessionStore((s) => s.sessions);
  const [visible, setVisible] = useState(false);
  const [sessionsSinceBackup, setSessionsSinceBackup] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      try {
        const [dismissed, storedCount, storedThreshold] = await Promise.all([
          db.getSetting<boolean>('backupDismissed'), db.getSetting<number>('sessionsSinceBackup'), db.getSetting<number>('backupThreshold'),
        ]);
        if (cancelled || current !== generation) return;
        const count = storedCount ?? sessions.length;
        setSessionsSinceBackup(count);
        setVisible(!dismissed && count >= (storedThreshold ?? 10));
      } catch { /* A reminder must not interrupt practice if storage is unavailable. */ }
    };
    void refresh();
    const handleChange = () => { void refresh(); };
    window.addEventListener('polypro:backup-status-changed', handleChange);
    return () => { cancelled = true; window.removeEventListener('polypro:backup-status-changed', handleChange); };
  }, [sessions.length]);

  const handleRemindLater = useCallback(async () => {
    try {
      await db.setSetting('backupThreshold', sessionsSinceBackup + 5);
      setVisible(false); setError(null);
    } catch { setError('Could not save the reminder. Please try again.'); }
  }, [sessionsSinceBackup]);

  const handleDismiss = useCallback(async () => {
    try {
      await db.setSetting('backupDismissed', true);
      setVisible(false); setError(null);
    } catch { setError('Could not save the reminder. Please try again.'); }
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-2 mb-2 bg-bg-surface border border-border-subtle rounded-md p-3">
      <p className="text-xs text-text-primary mb-1">
        You have {sessionsSinceBackup} sessions since your last backup.
      </p>
      <p className="text-xs text-text-muted mb-2">
        Back up in Settings → Data → Full Backup.
      </p>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleRemindLater}
          className="text-xs text-text-muted min-h-[36px] px-2"
        >
          Remind me later
        </button>
        <button
          onClick={handleDismiss}
          className="text-xs text-text-muted min-h-[36px] px-2"
        >
          Don't remind me
        </button>
      </div>
    </div>
  );
}
