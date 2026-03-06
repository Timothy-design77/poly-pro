/** Volume states for beat accents */
export enum VolumeState {
  OFF = 0,
  GHOST = 1,
  MED = 2,
  LOUD = 3,
}

/** Gain values mapped to volume states */
export const VOLUME_GAINS: Record<VolumeState, number> = {
  [VolumeState.OFF]: 0.0,
  [VolumeState.GHOST]: 0.2,
  [VolumeState.MED]: 0.55,
  [VolumeState.LOUD]: 1.0,
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
