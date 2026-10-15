import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./db', () => ({
  getAllProjects: vi.fn(async () => []),
  getAllPresets: vi.fn(async () => []),
  getSetting: vi.fn(async () => undefined),
  setSetting: vi.fn(async () => {}),
  putProject: vi.fn(async () => {}),
  patchProject: vi.fn(async (id, updates) => ({ ...useProjectStore.getState().projects.find((project) => project.id === id), ...updates })),
  deleteProject: vi.fn(async () => {}),
  putPreset: vi.fn(async () => {}),
  deletePreset: vi.fn(async () => {}),
}));

import { useProjectStore } from './project-store';
import type { ProjectRecord } from './db';
import { useMetronomeStore } from './metronome-store';
import { useSettingsStore } from './settings-store';
import * as db from './db';

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'p1',
    name: 'Test',
    icon: '🥁',
    created: new Date().toISOString(),
    lastOpened: new Date().toISOString(),
    startBpm: 80,
    goalBpm: 120,
    currentBpm: 100,
    accuracyTarget: 85,
    autoAdvance: true,
    advanceAfterN: 3,
    bpmStep: 5,
    consecutiveCount: 0,
    presetId: null,
    sessionIds: [],
    snapshot: null,
    ...overrides,
  };
}

describe('quick start project state', () => {
  it('loads with no forced project when the database has none', async () => {
    useProjectStore.setState({ projects: [], activeProjectId: null, presets: [], loaded: false });
    await useProjectStore.getState().loadFromDB();

    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(useProjectStore.getState().loaded).toBe(true);
  });

  it('can leave a project and return to Quick Start', async () => {
    useProjectStore.setState({
      projects: [makeProject()],
      activeProjectId: 'p1',
      presets: [],
      loaded: true,
    });

    await useProjectStore.getState().setActiveProject(null);
    expect(useProjectStore.getState().activeProjectId).toBeNull();
  });
});

describe('project auto-advance', () => {
  beforeEach(() => {
    useMetronomeStore.getState().setBpm(100);
    useProjectStore.setState({
      projects: [makeProject()],
      activeProjectId: 'p1',
      presets: [],
      loaded: true,
    });
  });

  const record = (score: number, bpm = 100) =>
    useProjectStore.getState().recordSessionResult('p1', score, bpm);

  const project = () => useProjectStore.getState().projects[0];

  it('builds a streak on passing sessions and advances after N', async () => {
    expect((await record(90)).advanced).toBe(false);
    expect(project().consecutiveCount).toBe(1);
    expect((await record(88)).advanced).toBe(false);
    expect(project().consecutiveCount).toBe(2);

    const third = await record(92);
    expect(third.advanced).toBe(true);
    expect(third.newBpm).toBe(105);
    expect(project().currentBpm).toBe(105);
    expect(project().consecutiveCount).toBe(0);
  });

  it('a failing session resets the streak', async () => {
    await record(90);
    await record(90);
    await record(60);
    expect(project().consecutiveCount).toBe(0);
    expect(project().currentBpm).toBe(100);
  });

  it('sessions below the current BPM neither count nor reset', async () => {
    await record(90);
    await record(90);
    const warmup = await record(50, 80);
    expect(warmup.advanced).toBe(false);
    expect(project().consecutiveCount).toBe(2);
  });

  it('never advances past the goal BPM', async () => {
    useProjectStore.setState({
      projects: [makeProject({ currentBpm: 118, goalBpm: 120, advanceAfterN: 1 })],
    });
    const res = await record(95, 118);
    expect(res.advanced).toBe(true);
    expect(res.newBpm).toBe(120);

    const atGoal = await record(95, 120);
    expect(atGoal.advanced).toBe(false);
    expect(project().currentBpm).toBe(120);
  });

  it('does nothing when autoAdvance is off', async () => {
    useProjectStore.setState({ projects: [makeProject({ autoAdvance: false })] });
    const res = await record(95);
    expect(res.advanced).toBe(false);
    expect(project().consecutiveCount).toBe(0);
  });

  it('advances the active transport and keeps the new tempo across project switches', async () => {
    useProjectStore.setState({ projects: [makeProject({ advanceAfterN: 1 })] });
    await record(95);
    expect(useMetronomeStore.getState().bpm).toBe(105);
    await useProjectStore.getState().setActiveProject(null);
    expect(project().currentBpm).toBe(105);
    await useProjectStore.getState().setActiveProject('p1');
    expect(useMetronomeStore.getState().bpm).toBe(105);
    expect(project().snapshot?.bpm).toBe(105);
    expect(db.patchProject).toHaveBeenCalledWith('p1', expect.objectContaining({ currentBpm: 105 }));
  });

  it('does not reset microphone, detection or calibration when selecting a new project', async () => {
    useProjectStore.setState({ activeProjectId: null });
    useSettingsStore.setState({ calibratedOffset: 87, noiseGate: 0.17, highPassHz: 240, includeClickInRecording: false });
    await useProjectStore.getState().setActiveProject('p1');
    expect(useSettingsStore.getState()).toMatchObject({ calibratedOffset: 87, noiseGate: 0.17, highPassHz: 240, includeClickInRecording: false });
  });
});
