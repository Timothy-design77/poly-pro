import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from './db';
vi.stubGlobal('window', globalThis);
const session: db.SessionRecord = { id: 'take', date: '2026-10-13T12:00:00Z', projectId: null, bpm: 120, meter: '4/4', subdivision: 1, durationMs: 1000, totalHits: 0, avgDelta: 0, stdDev: 0, perfectPct: 0, hasRecording: true };
const events: db.HitEventsRecord = { sessionId: 'take', rawOnsets: [], scoredOnsets: [] };
beforeEach(async () => { await db.clearAllData(); });

describe('durable sessions', () => {
  it('rejects stale analysis and preserves the latest events', async () => {
    await db.putSession(session);
    await db.putAnalysis({ ...session, analysisRevision: 1, score: 80 }, events, 0);
    await expect(db.putAnalysis({ ...session, analysisRevision: 1, score: 20 }, events, 0)).rejects.toThrow('changed in another view');
    expect((await db.getAllSessions())[0].score).toBe(80);
  });
  it('preserves newer recording and project metadata when analysis commits', async () => {
    await db.putSession({ ...session, projectId: 'new-project', hasRecording: false });
    const saved = await db.putAnalysis({ ...session, analysisRevision: 1, score: 80 }, events);
    expect(saved).toMatchObject({ projectId: 'new-project', hasRecording: false, score: 80 });
    expect((await db.getAllSessions())[0]).toEqual(saved);
  });
  it('deletes every chunk atomically so deleted sessions cannot recover', async () => {
    await db.beginChunkedRecording('take', 48000, { projectId: null, bpm: 120, meterNumerator: 4, meterDenominator: 4, subdivision: 1 });
    await db.appendRecordingChunk('take', 0, new Float32Array(48000));
    await db.putSession(session); await db.putHitEvents(events);
    await db.removeSessionData('take');
    expect(await db.recoverOrphanedRecordings(0)).toBe(0);
    expect(await db.getAllSessions()).toEqual([]);
    expect(await db.getRecording('take')).toBeUndefined();
    expect(await db.getHitEvents('take')).toBeUndefined();
  });
  it('recovers audio and its exact timing after an interrupted save', async () => {
    const timing = { recordingStartTime: 4.2, recordingEndTime: 5.2, scheduledBeats: [{ time: 4.6, beatIndex: 0, trackId: 'track-0', volumeState: 5 }] } as db.RecordingTiming;
    await db.beginChunkedRecording('take', 48000, { projectId: null, bpm: 120, meterNumerator: 4, meterDenominator: 4, subdivision: 1 });
    await db.appendRecordingChunk('take', 0, new Float32Array(48000), timing);
    expect(await db.recoverOrphanedRecordings(0, 'take')).toBe(1);
    expect((await db.getAllSessions())[0]).toMatchObject({ durationMs: 1000, recordingTiming: timing, recoveredRecording: true });
    expect((await db.getRecording('take'))?.size).toBe(192000);
  });
  it('rolls back a restore when a later record cannot be written', async () => {
    const data: db.BackupData = { settings: {}, projects: [], presets: [], sessions: [session], events: [], recordings: [], profiles: [], customSamples: [{ name: 'Invalid missing key' } as db.CustomSampleRecord] };
    await expect(db.restoreBackup(data, true)).rejects.toBeDefined();
    expect(await db.getAllSessions()).toEqual([]);
  });
});


it('restores a take whose project is absent into Quick Start', async () => {
  await db.restoreBackup({ settings: {}, projects: [], presets: [], sessions: [{ ...session, projectId: 'absent' }], events: [events], recordings: [], profiles: [], customSamples: [] }, false);
  expect((await db.getAllSessions())[0]).toMatchObject({ projectId: null, hasRecording: false });
});

it('deleting a project keeps its takes, audio and corrections in Quick Start', async () => {
  await db.putProject({ id: 'project', name: 'Practice', icon: '🥁', created: session.date, lastOpened: session.date, startBpm: 120, goalBpm: 140, currentBpm: 120, accuracyTarget: 85, autoAdvance: true, advanceAfterN: 3, bpmStep: 5, consecutiveCount: 0, presetId: null, sessionIds: [session.id], snapshot: null });
  await db.putSession({ ...session, projectId: 'project' });
  await db.putRecording(session.id, new Blob([new Float32Array(480).buffer]));
  await db.putHitEvents(events);
  await db.removeProjectData('project');
  expect(await db.getAllProjects()).toEqual([]);
  expect((await db.getAllSessions())[0]).toMatchObject({ projectId: null, hasRecording: true });
  expect((await db.getRecording(session.id))?.size).toBe(1920);
  expect(await db.getHitEvents(session.id)).toEqual(events);
});
