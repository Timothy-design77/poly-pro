import { create } from 'zustand';
import type { SessionRecord } from './db';
import * as db from './db';

interface SessionState {
  sessions: SessionRecord[];
  loaded: boolean;
  loadFromDB: () => Promise<void>;
  addSession: (session: SessionRecord) => Promise<void>;
  updateSession: (id: string, updates: Partial<SessionRecord>) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  getSessionsForProject: (projectId: string) => SessionRecord[];
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  loaded: false,

  loadFromDB: async () => {
    const sessions = await db.getAllSessions();
    sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    set({ sessions, loaded: true });
  },

  addSession: async (session) => {
    await db.putSession(session);
    set((s) => ({ sessions: [session, ...s.sessions] }));
  },

  updateSession: async (id, updates) => {
    const existing = get().sessions.find((s) => s.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await db.putSession(updated);
    set((s) => ({ sessions: s.sessions.map((ses) => (ses.id === id ? updated : ses)) }));
  },

  deleteSession: async (id) => {
    const existing = get().sessions.find((session) => session.id === id);
    await db.deleteSession(id);
    await db.deleteRecording(id);
    await db.deleteHitEvents(id);
    await db.deleteRecording(id + '-playback');
    set((s) => ({ sessions: s.sessions.filter((ses) => ses.id !== id) }));

    // Keep the redundant project sessionIds list consistent as well.
    if (existing?.projectId) {
      const { useProjectStore } = await import('./project-store');
      const projectState = useProjectStore.getState();
      const project = projectState.projects.find((item) => item.id === existing.projectId);
      if (project) {
        const updated = { ...project, sessionIds: project.sessionIds.filter((sessionId) => sessionId !== id) };
        useProjectStore.setState({
          projects: projectState.projects.map((item) => item.id === project.id ? updated : item),
        });
        await db.putProject(updated);
      }
    }
  },

  getSessionsForProject: (projectId) => get().sessions.filter((s) => s.projectId === projectId),
}));
