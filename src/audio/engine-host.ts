/**
 * EngineHost — the AudioEngine's only view of the outside world.
 *
 * The engine reads configuration and reports transport events exclusively
 * through this interface. It has no knowledge of Zustand, React, or any
 * specific state-management library, which makes it testable in isolation
 * and reusable outside the app shell.
 *
 * The production implementation (Zustand-backed) lives in ./index.ts.
 */

import type { TrackConfig } from './types';

/** Metronome configuration the engine reads each scheduler tick. */
export interface EngineMetronomeConfig {
  bpm: number;
  meterNumerator: number;
  subdivision: number;
  swing: number;
  volume: number;
  tracks: TrackConfig[];

  // Trainer
  trainerEnabled: boolean;
  trainerStartBpm: number;
  trainerEndBpm: number;
  trainerBpmStep: number;
  trainerBarsPerStep: number;

  // Count-in
  countInBars: number;

  // Practice modes
  gapClickEnabled: boolean;
  gapClickProbability: number;
  randomMuteEnabled: boolean;
  randomMuteProbability: number;
  playMuteCycleEnabled: boolean;
  playMuteCyclePlayBars: number;
  playMuteCycleMuteBars: number;
}

/** Sound/haptic settings the engine reads when triggering beats. */
export interface EngineSoundSettings {
  clickSound: string;
  accentSound: string;
  accentSoundThreshold: number;
  hapticEnabled: boolean;
  vibrationIntensity: number;
}

/** Dependency-inversion boundary between the engine and app state. */
export interface EngineHost {
  /** Read current metronome configuration (called every scheduler tick). */
  getMetronome(): EngineMetronomeConfig;
  /** Read current sound/haptic settings. */
  getSettings(): EngineSoundSettings;
  /** Trainer mode requests a BPM change. */
  setBpm(bpm: number): void;
  /** Transport started. `startedAtMs` is Date.now() at start. */
  onPlayStart(startedAtMs: number): void;
  /** A (non-count-in) bar boundary was crossed. */
  onBarAdvance(bar: number): void;
  /** Transport stopped. `trackIds` lists tracks whose indicators should clear. */
  onStop(trackIds: string[]): void;
}
