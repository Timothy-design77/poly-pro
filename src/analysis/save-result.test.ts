import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../store/db';
import { useSessionStore } from '../store/session-store';
import { useProjectStore } from '../store/project-store';
import { computeSessionAnalysis } from './scoring';
import { gridFromParams } from './grid';
import { DEFAULT_ANALYSIS_CONFIG } from './types';
import { saveAnalysisResult, UNCONFIRMED_PROGRESSION } from './save-result';

vi.stubGlobal('window', { setTimeout, clearTimeout, dispatchEvent: vi.fn(), addEventListener: vi.fn() });
const session: db.SessionRecord = { id: 'take', date: '2026-10-18T12:00:00Z', projectId: 'project', bpm: 120, meter: '4/4', subdivision: 1, durationMs: 10000, totalHits: 0, avgDelta: 0, stdDev: 0, perfectPct: 0, hasRecording: true };
const project: db.ProjectRecord = { id: 'project', name: 'Practice', icon: '🥁', created: session.date, lastOpened: session.date, startBpm: 120, goalBpm: 140, currentBpm: 120, accuracyTarget: 85, autoAdvance: true, advanceAfterN: 1, bpmStep: 5, consecutiveCount: 0, presetId: null, sessionIds: [session.id], snapshot: null };
const grid = gridFromParams(120, 4, 1, 10);
const config = { ...DEFAULT_ANALYSIS_CONFIG, latencyOffsetMs: 0 };
const result = computeSessionAnalysis(grid.map(({ time }) => ({ time, peak: 0.5, flux: 1, isFlam: false })), grid, config, 120, 1, 10000);

beforeEach(async () => {
  vi.restoreAllMocks();
  await db.clearAllData();
  await db.putSession(session); await db.putProject(project);
  useSessionStore.setState({ sessions: [session] });
  useProjectStore.setState({ projects: [project], activeProjectId: null });
});

describe('saved analysis follow-up operations', () => {
  it('keeps the score and a durable notice when project advancement fails', async () => {
    vi.spyOn(db, 'patchProject').mockRejectedValue(new Error('Project storage unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(saveAnalysisResult(session, result, config, true)).resolves.toBeUndefined();
    expect((await db.getAllSessions())[0]).toMatchObject({ score: 100, analyzed: true, analysisNotice: UNCONFIRMED_PROGRESSION });
    expect(await db.getHitEvents(session.id)).toBeDefined();
    expect(useSessionStore.getState().sessions[0].analysisNotice).toBe(UNCONFIRMED_PROGRESSION);
  });
  it('advances once, clears the notice, and does not add credit during re-analysis', async () => {
    await saveAnalysisResult(session, result, config, true);
    const saved = (await db.getAllSessions())[0];
    expect(saved.analysisNotice).toBeUndefined();
    expect((await db.getAllProjects())[0].currentBpm).toBe(125);
    await saveAnalysisResult(saved, result, config, true);
    expect((await db.getAllProjects())[0].currentBpm).toBe(125);
  });
  it('does not report failure if backup reminder lookup fails after the score saves', async () => {
    vi.spyOn(db, 'getSetting').mockRejectedValue(new Error('Reminder unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(saveAnalysisResult(session, result, config, false)).resolves.toBeUndefined();
    expect((await db.getAllSessions())[0]).toMatchObject({ analyzed: true, score: 100 });
    expect((await db.getAllSessions())[0].analysisNotice).toBeUndefined();
  });
  it('retains its conservative notice when advancement succeeds but clearing the notice fails', async () => {
    vi.spyOn(db, 'patchSession').mockRejectedValue(new Error('Notice storage unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(saveAnalysisResult(session, result, config, true)).resolves.toBeUndefined();
    expect((await db.getAllProjects())[0].currentBpm).toBe(125);
    expect((await db.getAllSessions())[0]).toMatchObject({ analyzed: true, analysisNotice: UNCONFIRMED_PROGRESSION });
  });
});
