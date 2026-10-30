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
    const existing = get().sessions.find((session) => session.id === id);
    if (!existing) return;
    const updated = await db.patchSession(id, updates);
    set((state) => ({ sessions: updated
      ? state.sessions.map((session) => session.id === id ? updated : session)
      : state.sessions.filter((session) => session.id !== id) }));
  },

  deleteSession: async (id) => {
    await db.removeSessionData(id);
    set((state) => ({ sessions: state.sessions.filter((session) => session.id !== id) }));
    const { useProjectStore } = await import('./project-store');
    await useProjectStore.getState().loadFromDB();
  },

  getSessionsForProject: (projectId) => get().sessions.filter((s) => s.projectId === projectId),
}));
