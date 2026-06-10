/**
 * Audio module entry point.
 *
 * Wires the framework-agnostic AudioEngine to the app's Zustand stores
 * via the EngineHost adapter, and exports the app-wide singleton.
 *
 * The engine class itself (./engine.ts) has no store dependencies —
 * construct it with a fake host to test or simulate it.
 */

import { AudioEngine } from './engine';
import type { EngineHost } from './engine-host';
import { useMetronomeStore } from '../store/metronome-store';
import { useSettingsStore } from '../store/settings-store';

const zustandHost: EngineHost = {
  getMetronome: () => useMetronomeStore.getState(),

  getSettings: () => useSettingsStore.getState(),

  setBpm: (bpm) => useMetronomeStore.getState().setBpm(bpm),

  onPlayStart: (startedAtMs) => {
    useMetronomeStore.setState({ playStartTime: startedAtMs, currentBar: 0 });
  },

  onBarAdvance: (bar) => {
    useMetronomeStore.setState({ currentBar: bar });
  },

  onStop: (trackIds) => {
    const cleared: Record<string, number> = {};
    for (const id of trackIds) cleared[id] = -1;
    useMetronomeStore.setState({ currentBeats: cleared, playStartTime: 0 });
  },
};

export const audioEngine = new AudioEngine(zustandHost);

export { AudioEngine } from './engine';
export type { EngineHost, EngineMetronomeConfig, EngineSoundSettings } from './engine-host';
