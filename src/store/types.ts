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

  // Beat animation state
  currentBeatIndex: number;
  currentBeatTime: number;

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
  setSubdivision: (sub: number) => void;
  setVolume: (vol: number) => void;
  setSwing: (swing: number) => void;
  setCurrentBeat: (index: number, time: number) => void;
  updateTrackAccent: (trackId: string, beatIndex: number) => void;
  setTrackSound: (trackId: string, soundId: string, isAccent: boolean) => void;
  setTrackMuted: (trackId: string, muted: boolean) => void;
  setTrackSwing: (trackId: string, swing: number) => void;
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
  setHapticEnabled: (enabled: boolean) => void;
  setVibrationIntensity: (intensity: number) => void;
  setLatencyOffset: (offset: number) => void;
}

// ─── Helper to create default track ───

export function createDefaultTrack(
  numerator: number,
  subdivision: number,
  trackId = 'track-0'
): TrackConfig {
  const totalBeats = numerator * subdivision;
  const accents: VolumeState[] = [];

  for (let i = 0; i < totalBeats; i++) {
    if (i === 0) {
      accents.push(VolumeState.ACCENT);
    } else if (i % subdivision === 0) {
      accents.push(VolumeState.LOUD);
    } else {
      accents.push(VolumeState.SOFT);
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
  };
}
