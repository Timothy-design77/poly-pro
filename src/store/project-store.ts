import { create } from 'zustand';
import type { ProjectRecord, PresetRecord, MetronomeSnapshot } from './db';
import * as db from './db';
import { useMetronomeStore } from './metronome-store';
import { useSettingsStore } from './settings-store';
import type { TrackConfig } from '../audio/types';

/** Capture current metronome + settings state as a snapshot */
function captureSnapshot(): MetronomeSnapshot {
  const m = useMetronomeStore.getState();
  const s = useSettingsStore.getState();
  return {
    bpm: m.bpm,
    meterNumerator: m.meterNumerator,
    meterDenominator: m.meterDenominator,
    beatGrouping: m.beatGrouping,
    subdivision: m.subdivision,
    volume: m.volume,
    swing: m.swing,
    tracks: m.tracks,
    trainerEnabled: m.trainerEnabled,
    trainerStartBpm: m.trainerStartBpm,
    trainerEndBpm: m.trainerEndBpm,
    trainerBpmStep: m.trainerBpmStep,
    trainerBarsPerStep: m.trainerBarsPerStep,
    countInBars: m.countInBars,
    gapClickEnabled: m.gapClickEnabled,
    gapClickProbability: m.gapClickProbability,
    randomMuteEnabled: m.randomMuteEnabled,
    randomMuteProbability: m.randomMuteProbability,
    playMuteCycleEnabled: m.playMuteCycleEnabled,
    playMuteCyclePlayBars: m.playMuteCyclePlayBars,
    playMuteCycleMuteBars: m.playMuteCycleMuteBars,
    clickSound: s.clickSound,
    accentSound: s.accentSound,
    clickVolume: s.clickVolume,
    accentSoundThreshold: s.accentSoundThreshold,
    hapticEnabled: s.hapticEnabled,
    vibrationIntensity: s.vibrationIntensity,
  };
}

/** Restore a snapshot into metronome + settings stores */
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
    clickVolume: snap.clickVolume,
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

  // Actions
  loadFromDB: () => Promise<void>;
  createProject: (project: Omit<ProjectRecord, 'id' | 'created' | 'lastOpened' | 'currentBpm' | 'consecutiveCount' | 'sessionIds' | 'snapshot'>) => Promise<string>;
  updateProject: (id: string, updates: Partial<ProjectRecord>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (id: string) => void;
  getActiveProject: () => ProjectRecord | null;

  // Presets
  savePreset: (preset: Omit<PresetRecord, 'id' | 'created'>) => Promise<string>;
  deletePreset: (id: string) => Promise<void>;
  loadPreset: (id: string) => PresetRecord | null;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Debounce IDB writes
let writeTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedWrite(fn: () => Promise<void>) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => fn(), 500);
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
      db.getSetting<string>('activeProjectId'),
    ]);

    // Create default project if none exist
    if (projects.length === 0) {
      const defaultProject: ProjectRecord = {
        id: generateId(),
        name: 'My First Project',
        icon: '🥁',
        created: new Date().toISOString(),
        lastOpened: new Date().toISOString(),
        startBpm: 80,
        goalBpm: 120,
        currentBpm: 80,
        accuracyTarget: 85,
        autoAdvance: true,
        advanceAfterN: 3,
        bpmStep: 5,
        consecutiveCount: 0,
        presetId: null,
        sessionIds: [],
        snapshot: null,
      };
      await db.putProject(defaultProject);
      projects.push(defaultProject);
      await db.setSetting('activeProjectId', defaultProject.id);
      set({ projects, activeProjectId: defaultProject.id, presets, loaded: true });
    } else {
      set({
        projects,
        presets,
        activeProjectId: activeId || projects[0].id,
        loaded: true,
      });
    }
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

    // Auto-activate the new project (snapshots old, resets to clean defaults)
    get().setActiveProject(id);
    return id;
  },

  updateProject: async (id, updates) => {
    const { projects } = get();
    const updated = projects.map((p) =>
      p.id === id ? { ...p, ...updates } : p
    );
    set({ projects: updated });
    const project = updated.find((p) => p.id === id);
    if (project) {
      debouncedWrite(() => db.putProject(project));
    }
  },

  deleteProject: async (id) => {
    const { activeProjectId } = get();
    if (id === activeProjectId) return; // can't delete active
    await db.deleteProject(id);
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  },

  setActiveProject: (id) => {
    const { projects, activeProjectId } = get();
    if (id === activeProjectId) return;

    // 1. Save snapshot of current state to the OLD project
    if (activeProjectId) {
      const snapshot = captureSnapshot();
      const oldProject = projects.find((p) => p.id === activeProjectId);
      if (oldProject) {
        const updated = { ...oldProject, snapshot, currentBpm: snapshot.bpm };
        set((s) => ({ projects: s.projects.map((p) => p.id === activeProjectId ? updated : p) }));
        db.putProject(updated).catch(console.error);
      }
    }

    // 2. Switch active project
    set({ activeProjectId: id });
    debouncedWrite(() => db.setSetting('activeProjectId', id));

    // 3. Restore snapshot from the NEW project (or defaults from project config)
    const newProject = projects.find((p) => p.id === id);
    if (newProject) {
      if (newProject.snapshot) {
        restoreSnapshot(newProject.snapshot);
      } else {
        // No snapshot yet — reset BOTH stores to clean defaults
        useMetronomeStore.getState().resetToDefaults();
        useSettingsStore.getState().resetToDefaults();
        useMetronomeStore.getState().setBpm(newProject.currentBpm);
      }
      // Update lastOpened
      const updated = { ...newProject, lastOpened: new Date().toISOString() };
      set((s) => ({ projects: s.projects.map((p) => p.id === id ? updated : p) }));
      debouncedWrite(() => db.putProject(updated));
    }
  },

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return projects.find((p) => p.id === activeProjectId) || null;
  },

  savePreset: async (input) => {
    const id = generateId();
    const preset: PresetRecord = {
      ...input,
      id,
      created: new Date().toISOString(),
    };
    await db.putPreset(preset);
    set((s) => ({ presets: [...s.presets, preset] }));
    return id;
  },

  deletePreset: async (id) => {
    await db.deletePreset(id);
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) }));
  },

  loadPreset: (id) => {
    const { presets } = get();
    return presets.find((p) => p.id === id) || null;
  },
}));
