import { create } from 'zustand';
import type { ProjectRecord, PresetRecord } from './db';
import * as db from './db';

interface ProjectState {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  presets: PresetRecord[];
  loaded: boolean;

  // Actions
  loadFromDB: () => Promise<void>;
  createProject: (project: Omit<ProjectRecord, 'id' | 'created' | 'lastOpened' | 'currentBpm' | 'consecutiveCount' | 'sessionIds'>) => Promise<string>;
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
    };
    await db.putProject(project);
    set((s) => ({ projects: [...s.projects, project] }));
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
    set({ activeProjectId: id });
    debouncedWrite(() => db.setSetting('activeProjectId', id));
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
