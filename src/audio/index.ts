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

// Presets and projects can change sounds without opening a sound picker.
// Prepare that selection without resuming audio or blocking the transport.
const prepareSelection = () => { void audioEngine.prepare().catch((error) => console.warn('Sound preparation failed:', error)); };
const unsubscribeSettings = useSettingsStore.subscribe((state, previous) => {
  if (state.clickSound !== previous.clickSound || state.accentSound !== previous.accentSound) prepareSelection();
});
const unsubscribeTracks = useMetronomeStore.subscribe((state, previous) => {
  if (state.tracks !== previous.tracks || state.countInBars !== previous.countInBars) prepareSelection();
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribeSettings(); unsubscribeTracks(); void audioEngine.dispose(); });

export { AudioEngine } from './engine';
export type { EngineHost, EngineMetronomeConfig, EngineSoundSettings } from './engine-host';
