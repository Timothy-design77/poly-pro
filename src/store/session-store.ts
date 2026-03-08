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
    // Sort by date descending
    sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    set({ sessions, loaded: true });
  },

  addSession: async (session) => {
    await db.putSession(session);
    set((s) => ({
      sessions: [session, ...s.sessions],
    }));
  },

  updateSession: async (id, updates) => {
    const { sessions } = get();
    const existing = sessions.find((s) => s.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await db.putSession(updated);
    set((s) => ({
      sessions: s.sessions.map((ses) => (ses.id === id ? updated : ses)),
    }));
  },

  deleteSession: async (id) => {
    await db.deleteSession(id);
    await db.deleteRecording(id);
    await db.deleteHitEvents(id);
    set((s) => ({
      sessions: s.sessions.filter((ses) => ses.id !== id),
    }));
  },

  getSessionsForProject: (projectId) => {
    const { sessions } = get();
    return sessions.filter((s) => s.projectId === projectId);
  },
}));
