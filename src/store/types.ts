import type { TrackConfig } from '../audio/types';
import { VolumeState } from '../audio/types';

// ─── Metronome Store ───

export interface MetronomeState {
  // Playback
  playing: boolean;
  bpm: number;
  meterNumerator: number;
  meterDenominator: number;
  beatGrouping: number[];
  subdivision: number;
  volume: number;

  // Tracks
  tracks: TrackConfig[];

  // Beat animation state (per-track)
  currentBeats: Record<string, number>;

  // Trainer mode
  trainerEnabled: boolean;
  trainerStartBpm: number;
  trainerEndBpm: number;
  trainerBpmStep: number;
  trainerBarsPerStep: number;

  // Count-in
  countInBars: number;

  // Practice modes
  gapClickEnabled: boolean;
  gapClickProbability: number;  // 0-1, probability a beat is muted
  randomMuteEnabled: boolean;
  randomMuteProbability: number; // 0-1, probability a measure is muted

  // Swing (global default, tracks can override)
  swing: number;

  // Actions
  setPlaying: (playing: boolean) => void;
  setBpm: (bpm: number) => void;
  adjustBpm: (delta: number) => void;
  setMeter: (numerator: number, denominator: number) => void;
  setGrouping: (grouping: number[]) => void;
  setSubdivision: (sub: number) => void;
  setVolume: (vol: number) => void;
  setSwing: (swing: number) => void;
  setCurrentBeat: (trackId: string, index: number) => void;
  updateTrackAccent: (trackId: string, beatIndex: number) => void;
  setTrackSound: (trackId: string, soundId: string, isAccent: boolean) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSwing: (trackId: string, swing: number) => void;
  setBeatSound: (trackId: string, beatIndex: number, soundId: string | null) => void;
  setAllSubdivisionVolume: (volume: VolumeState) => void;
  addTrack: (beats: number) => void;
  removeTrack: (trackId: string) => void;
  setTrainerEnabled: (enabled: boolean) => void;
  setTrainerConfig: (config: Partial<Pick<MetronomeState,
    'trainerStartBpm' | 'trainerEndBpm' | 'trainerBpmStep' | 'trainerBarsPerStep'>>) => void;
  setCountInBars: (bars: number) => void;
  setGapClick: (enabled: boolean, probability?: number) => void;
  setRandomMute: (enabled: boolean, probability?: number) => void;
  resetToDefaults: () => void;
}

// ─── Settings Store ───

export interface SettingsState {
  // Sound
  clickSound: string;
  accentSound: string;
  clickVolume: number;
  /** Volume level at or above which the accent sound is used instead of normal */
  accentSoundThreshold: number;

  // Vibration
  hapticEnabled: boolean;
  vibrationIntensity: number;

  // Detection (stubs for now)
  sensitivity: number;
  scoringWindow: number;
  flamMergeWindow: number;
  accentThreshold: number;
  noiseFloor: number;

  // Calibration
  latencyOffset: number;

  // Recording
  recordingClickVolume: number;
  includeClickInRecording: boolean;

  // Actions
  setClickSound: (id: string) => void;
  setAccentSound: (id: string) => void;
  setClickVolume: (vol: number) => void;
  setAccentSoundThreshold: (level: number) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setVibrationIntensity: (intensity: number) => void;
  setLatencyOffset: (offset: number) => void;
}

// ─── Helper to create default track ───

export function createDefaultTrack(
  numerator: number,
  subdivision: number,
  trackId = 'track-0',
  grouping?: number[]
): TrackConfig {
  const totalBeats = numerator * subdivision;
  const accents: VolumeState[] = [];

  // Compute which beat positions are group boundaries
  const groups = grouping || [numerator];
  const groupStarts = new Set<number>([0]);
  let pos = 0;
  for (let g = 0; g < groups.length - 1; g++) {
    pos += groups[g];
    groupStarts.add(pos);
  }

  for (let i = 0; i < totalBeats; i++) {
    const beatNum = Math.floor(i / subdivision);
    const isSubdivision = i % subdivision !== 0;

    if (isSubdivision) {
      accents.push(VolumeState.SOFT);
    } else if (beatNum === 0) {
      // Downbeat — always loudest
      accents.push(VolumeState.ACCENT);
    } else if (groupStarts.has(beatNum)) {
      // Group boundary — strong emphasis
      accents.push(VolumeState.LOUD);
    } else {
      // Other main beats — moderate
      accents.push(VolumeState.MED);
    }
  }

  return {
    id: trackId,
    beats: totalBeats,
    accents,
    normalSound: 'woodblock',
    normalVolume: 1,
    accentSound: 'woodblock',
    accentVolume: 2,
    muted: false,
    swing: 0,
    soundOverrides: {},
  };
}
