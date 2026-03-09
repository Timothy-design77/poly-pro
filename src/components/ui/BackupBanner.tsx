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

  useEffect(() => {
    (async () => {
      const dismissed = await db.getSetting<boolean>('backupDismissed');
      if (dismissed) return;

      const count = (await db.getSetting<number>('sessionsSinceBackup')) ?? sessions.length;
      const threshold = (await db.getSetting<number>('backupThreshold')) ?? 10;

      setSessionsSinceBackup(count);
      if (count >= threshold) {
        setVisible(true);
      }
    })();
  }, [sessions.length]);

  const handleRemindLater = useCallback(async () => {
    // Push threshold by 5
    const current = (await db.getSetting<number>('backupThreshold')) ?? 10;
    await db.setSetting('backupThreshold', current + 5);
    setVisible(false);
  }, []);

  const handleDismiss = useCallback(async () => {
    await db.setSetting('backupDismissed', true);
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-2 mb-2 bg-bg-surface border border-border-subtle rounded-md p-3">
      <p className="text-xs text-text-primary mb-1">
        You have {sessionsSinceBackup} sessions since your last backup.
      </p>
      <p className="text-[10px] text-text-muted mb-2">
        Back up in Settings → Data → Export Backup.
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleRemindLater}
          className="text-[10px] text-text-muted min-h-[36px] px-2"
        >
          Remind me later
        </button>
        <button
          onClick={handleDismiss}
          className="text-[10px] text-text-muted min-h-[36px] px-2"
        >
          Don't remind me
        </button>
      </div>
    </div>
  );
}
