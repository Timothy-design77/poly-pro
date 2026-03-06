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

  // Actions
  setPlaying: (playing: boolean) => void;
  setBpm: (bpm: number) => void;
  adjustBpm: (delta: number) => void;
  setMeter: (numerator: number, denominator: number) => void;
  setSubdivision: (sub: number) => void;
  setVolume: (vol: number) => void;
  setCurrentBeat: (index: number, time: number) => void;
  updateTrackAccent: (trackId: string, beatIndex: number) => void;
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
  subdivision: number
): TrackConfig {
  const totalBeats = numerator * subdivision;
  const accents: VolumeState[] = [];

  for (let i = 0; i < totalBeats; i++) {
    if (i === 0) {
      accents.push(VolumeState.ACCENT);  // downbeat = loudest + accent sound
    } else if (i % subdivision === 0) {
      accents.push(VolumeState.LOUD);    // other beats = strong
    } else {
      accents.push(VolumeState.SOFT);    // subdivisions = quiet
    }
  }

  return {
    id: 'track-0',
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
