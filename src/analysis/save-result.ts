import type { AnalysisConfig, SessionAnalysis } from './types';
import { persistAnalysisResult } from './persistence';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';
import { useProjectStore } from '../store/project-store';

export const UNCONFIRMED_PROGRESSION = 'Project advancement has not been confirmed. Check the project tempo before continuing.';

/** Once analysis is durable, optional follow-up failures must not report a lost take. */
export async function saveAnalysisResult(
  session: db.SessionRecord,
  result: SessionAnalysis,
  config: AnalysisConfig,
  hasCapturedGrid: boolean,
): Promise<void> {
  const project = useProjectStore.getState().projects.find((item) => item.id === session.projectId);
  const eligible = !session.analyzed && project?.autoAdvance && session.bpm >= project.currentBpm && result.totalScored >= 8 && hasCapturedGrid;
  // Save a conservative notice first: it survives quota failures or closing the app
  // between the score commit and the independent project update.
  await persistAnalysisResult(eligible ? { ...session, analysisNotice: UNCONFIRMED_PROGRESSION } : session, result, undefined, config);
  if (eligible && project) {
    try {
      await useProjectStore.getState().recordSessionResult(project.id, result.score, session.bpm);
      const saved = await db.patchSession(session.id, { analysisNotice: undefined });
      if (saved) useSessionStore.setState((state) => ({ sessions: state.sessions.map((item) => item.id === session.id ? saved : item) }));
    } catch (error) {
      console.warn('Project advancement could not be confirmed:', error);
    }
  }
  if (!session.analyzed) {
    try {
      const count = (await db.getSetting<number>('sessionsSinceBackup')) ?? 0;
      await db.setSetting('sessionsSinceBackup', count + 1);
      window.dispatchEvent(new Event('polypro:backup-status-changed'));
    } catch (error) {
      console.warn('Backup reminder could not be updated:', error);
    }
  }
}
