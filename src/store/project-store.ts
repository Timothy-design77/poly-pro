import { create } from 'zustand';
import type { ProjectRecord, PresetRecord, MetronomeSnapshot } from './db';
import { captureSnapshot as captureSnapshotFromStores } from './persisted-shapes';
import * as db from './db';
import { useMetronomeStore } from './metronome-store';
import { useSettingsStore } from './settings-store';
import type { TrackConfig } from '../audio/types';

function captureSnapshot(): MetronomeSnapshot {
  return captureSnapshotFromStores(useMetronomeStore.getState(), useSettingsStore.getState());
}

function restoreSnapshot(snap: MetronomeSnapshot): void {
  useMetronomeStore.setState({
    bpm: snap.bpm,
    meterNumerator: snap.meterNumerator,
    meterDenominator: snap.meterDenominator,
    beatGrouping: snap.beatGrouping,
    subdivision: snap.subdivision,
    volume: snap.volume,
    swing: snap.swing,
    tracks: snap.tracks as TrackConfig[],
    trainerEnabled: snap.trainerEnabled,
    trainerStartBpm: snap.trainerStartBpm,
    trainerEndBpm: snap.trainerEndBpm,
    trainerBpmStep: snap.trainerBpmStep,
    trainerBarsPerStep: snap.trainerBarsPerStep,
    countInBars: snap.countInBars,
    gapClickEnabled: snap.gapClickEnabled,
    gapClickProbability: snap.gapClickProbability,
    randomMuteEnabled: snap.randomMuteEnabled,
    randomMuteProbability: snap.randomMuteProbability,
    playMuteCycleEnabled: snap.playMuteCycleEnabled,
    playMuteCyclePlayBars: snap.playMuteCyclePlayBars,
    playMuteCycleMuteBars: snap.playMuteCycleMuteBars,
  });
  useSettingsStore.setState({
    clickSound: snap.clickSound,
    accentSound: snap.accentSound,
    accentSoundThreshold: snap.accentSoundThreshold,
    hapticEnabled: snap.hapticEnabled,
    vibrationIntensity: snap.vibrationIntensity,
  });
}

interface ProjectState {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  presets: PresetRecord[];
  loaded: boolean;
  loadFromDB: () => Promise<void>;
  createProject: (project: Omit<ProjectRecord, 'id' | 'created' | 'lastOpened' | 'currentBpm' | 'consecutiveCount' | 'sessionIds' | 'snapshot'>) => Promise<string>;
  updateProject: (id: string, updates: Partial<ProjectRecord>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string | null) => Promise<void>;
  getActiveProject: () => ProjectRecord | null;
  recordSessionResult: (projectId: string, score: number, sessionBpm: number) => Promise<{ advanced: boolean; newBpm: number | null }>;
  savePreset: (preset: Omit<PresetRecord, 'id' | 'created'>) => Promise<string>;
  deletePreset: (id: string) => Promise<void>;
  loadPreset: (id: string) => PresetRecord | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  presets: [],
  loaded: false,

  loadFromDB: async () => {
    const [projects, presets, activeId] = await Promise.all([
      db.getAllProjects(),
      db.getAllPresets(),
      db.getSetting<string | null>('activeProjectId'),
    ]);
    const validActiveId = activeId && projects.some((project) => project.id === activeId) ? activeId : null;
    set({ projects, presets, activeProjectId: validActiveId, loaded: true });
  },

  createProject: async (input) => {
    const id = generateId();
    const project: ProjectRecord = {
      ...input,
      id,
      created: new Date().toISOString(),
      lastOpened: new Date().toISOString(),
      currentBpm: input.startBpm,
      consecutiveCount: 0,
      sessionIds: [],
      snapshot: null,
    };
    await db.putProject(project);
    set((s) => ({ projects: [...s.projects, project] }));
    await get().setActiveProject(id);
    return id;
  },

  updateProject: async (id, updates) => {
    const updated = await db.patchProject(id, updates);
    if (!updated) throw new Error('This project no longer exists. Reload Projects.');
    set((state) => ({ projects: state.projects.map((project) => project.id === id ? updated : project) }));
  },

  deleteProject: async (id) => {
    if (id === get().activeProjectId) throw new Error('Switch to Quick Start before deleting the active project.');
    await db.removeProjectData(id);
    set((state) => ({ projects: state.projects.filter((project) => project.id !== id), presets: state.presets.filter((preset) => preset.projectId !== id) }));
    const { useSessionStore } = await import('./session-store');
    await useSessionStore.getState().loadFromDB();
  },

  setActiveProject: async (id) => {
    const { projects, activeProjectId } = get();
    if (id === activeProjectId) return;
    if (id !== null && !projects.some((project) => project.id === id)) return;

    if (activeProjectId) {
      const snapshot = captureSnapshot();
      const oldProject = projects.find((project) => project.id === activeProjectId);
      if (oldProject) {
        await get().updateProject(oldProject.id, { snapshot, currentBpm: snapshot.bpm });
      }
    }

    await db.setSetting('activeProjectId', id);
    set({ activeProjectId: id });
    if (id === null) return;

    const newProject = projects.find((project) => project.id === id);
    if (newProject) {
      if (newProject.snapshot) {
        restoreSnapshot(newProject.snapshot);
      } else {
        useMetronomeStore.getState().resetToDefaults();
        useMetronomeStore.getState().setBpm(newProject.currentBpm);
      }
      await get().updateProject(newProject.id, { lastOpened: new Date().toISOString() });
    }
  },

  getActiveProject: () => get().projects.find((p) => p.id === get().activeProjectId) || null,

  recordSessionResult: async (projectId, score, sessionBpm) => {
    const project = get().projects.find((p) => p.id === projectId);
    if (!project || !project.autoAdvance) return { advanced: false, newBpm: null };
    if (sessionBpm < project.currentBpm) return { advanced: false, newBpm: null };

    const passed = score >= project.accuracyTarget;
    if (!passed) {
      if (project.consecutiveCount > 0) await get().updateProject(projectId, { consecutiveCount: 0 });
      return { advanced: false, newBpm: null };
    }

    const streak = project.consecutiveCount + 1;
    const canAdvance = project.currentBpm < project.goalBpm;
    if (streak >= project.advanceAfterN && canAdvance) {
      const newBpm = Math.min(project.currentBpm + project.bpmStep, project.goalBpm);
      const active = get().activeProjectId === projectId;
      const snapshot = active ? captureSnapshot() : project.snapshot;
      await get().updateProject(projectId, {
        consecutiveCount: 0, currentBpm: newBpm,
        snapshot: snapshot ? { ...snapshot, bpm: newBpm } : null,
      });
      if (active) useMetronomeStore.getState().setBpm(newBpm);
      return { advanced: true, newBpm };
    }

    await get().updateProject(projectId, { consecutiveCount: streak });
    return { advanced: false, newBpm: null };
  },

  savePreset: async (input) => {
    const id = generateId();
    const preset: PresetRecord = { ...input, id, created: new Date().toISOString() };
    await db.putPreset(preset);
    set((s) => ({ presets: [...s.presets, preset] }));
    return id;
  },

  deletePreset: async (id) => {
    await db.deletePreset(id);
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
  },

  loadPreset: (id) => get().presets.find((p) => p.id === id) || null,
}));
