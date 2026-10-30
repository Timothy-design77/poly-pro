import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import * as db from './db';
import { useSessionStore } from './session-store';

vi.stubGlobal('window', globalThis);
const session: db.SessionRecord = { id: 'take', date: '2026-10-30T12:00:00Z', projectId: null, bpm: 120, meter: '4/4', subdivision: 1, durationMs: 1000, totalHits: 0, avgDelta: 0, stdDev: 0, perfectPct: 0, hasRecording: true };
beforeEach(async () => {
  await db.clearAllData();
  await db.putSession(session);
  await useSessionStore.getState().loadFromDB();
});

it('patches stored metadata without replacing newer analysis and audio state', async () => {
  await db.patchSession(session.id, { score: 92, analysisRevision: 4, hasRecording: false });
  await useSessionStore.getState().updateSession(session.id, { analysisNotice: 'Saved' });
  expect((await db.getAllSessions())[0]).toMatchObject({ score: 92, analysisRevision: 4, hasRecording: false, analysisNotice: 'Saved' });
  expect(useSessionStore.getState().sessions[0]).toEqual((await db.getAllSessions())[0]);
});

it('does not resurrect a take deleted by another view', async () => {
  await db.removeSessionData(session.id);
  await useSessionStore.getState().updateSession(session.id, { analysisNotice: 'Saved' });
  expect(await db.getAllSessions()).toEqual([]);
  expect(useSessionStore.getState().sessions).toEqual([]);
});

it('retains independent concurrent metadata changes', async () => {
  await Promise.all([
    useSessionStore.getState().updateSession(session.id, { analysisNotice: 'Saved' }),
    useSessionStore.getState().updateSession(session.id, { projectId: 'project' }),
  ]);
  expect((await db.getAllSessions())[0]).toMatchObject({ analysisNotice: 'Saved', projectId: 'project' });
  expect(useSessionStore.getState().sessions[0]).toEqual((await db.getAllSessions())[0]);
});
