/** Volume states for beat accents — 6 levels: OFF + 5 audible */
export enum VolumeState {
  OFF = 0,
  GHOST = 1,    // barely audible tap
  SOFT = 2,     // quiet
  MED = 3,      // moderate
  LOUD = 4,     // strong
  ACCENT = 5,   // loudest — uses accent sound
}

/** Number of audible volume states (for cycling) */
export const VOLUME_STATE_COUNT = 6;

/** Gain values for each volume level — tuned for mobile speakers */
export const VOLUME_GAINS: Record<VolumeState, number> = {
  [VolumeState.OFF]: 0.0,
  [VolumeState.GHOST]: 0.08,
  [VolumeState.SOFT]: 0.20,
  [VolumeState.MED]: 0.45,
  [VolumeState.LOUD]: 0.75,
  [VolumeState.ACCENT]: 1.0,
};

/** Track configuration for one layer */
export interface TrackConfig {
  id: string;
  beats: number;
  accents: VolumeState[];
  normalSound: string;
  normalVolume: number;
  accentSound: string;
  accentVolume: number;
  muted: boolean;
  swing: number;
  /** Per-beat sound overrides. Key = beat index, value = sound ID */
  soundOverrides: Record<number, string>;
}

/** Config snapshot the scheduler reads each tick */
export interface MetronomeConfig {
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  subdivision: number;
  volume: number;
  tracks: TrackConfig[];
}

/** A beat event scheduled by the engine, used for UI sync */
export interface ScheduledBeat {
  beatIndex: number;
  time: number;
  trackId: string;
  volumeState: VolumeState;
}

/** Beat event pushed to the visual queue for UI animation */
export interface BeatEvent {
  beatIndex: number;
  time: number;
  trackId: string;
}

/** Sound catalog entry */
export interface SoundEntry {
  id: string;
  name: string;
  category: 'clicks' | 'drums' | 'percussion' | 'tonal';
  file: string;
}
