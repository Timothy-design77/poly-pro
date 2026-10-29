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

  // Bar counter + session timer
  currentBar: number;
  playStartTime: number;

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
  gapClickProbability: number;
  randomMuteEnabled: boolean;
  randomMuteProbability: number;
  playMuteCycleEnabled: boolean;
  playMuteCyclePlayBars: number;
  playMuteCycleMuteBars: number;

  // Swing
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
  setCurrentBar: (bar: number) => void;
  setPlayStartTime: (time: number) => void;
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
  setPlayMuteCycle: (enabled: boolean, playBars?: number, muteBars?: number) => void;
  resetToDefaults: () => void;
}

// ─── Settings Store ───

export interface SettingsState {
  // Sound
  clickSound: string;
  accentSound: string;
  /** Volume level at or above which the accent sound is used instead of normal */
  accentSoundThreshold: number;

  // Vibration
  hapticEnabled: boolean;
  vibrationIntensity: number;

  // Detection
  sensitivity: number;
  scoringWindowPct: number;
  flamMergePct: number;
  noiseGate: number;
  accentThreshold: number;
  highPassHz: number;
  detectionPreset: string;
  noiseFloorMultiplier: number;
  minOnsetIntervalMs: number;
  postHitMaskingMs: number;
  postHitMaskingStrength: number;
  fluxThresholdOffset: number;

  // Calibration
  calibratedOffset: number;
  manualAdjustment: number;
  lastCalibratedAt: string | null;
  calibrationConsistency: number | null;

  // Recording
  includeClickInRecording: boolean;
  clickVolumeInRecording: number;
  liveWaveform: boolean;
  audioAfterAnalysis: 'compress' | 'keep-raw' | 'delete';
  rawPcmRetentionDays: number;

  // Actions
  setClickSound: (id: string) => void;
  setAccentSound: (id: string) => void;
  setAccentSoundThreshold: (level: number) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setVibrationIntensity: (intensity: number) => void;
  setCalibratedOffset: (offset: number) => void;
  setManualAdjustment: (adj: number) => void;
  setLastCalibratedAt: (date: string) => void;
  setCalibrationConsistency: (value: number) => void;
  setSensitivity: (value: number) => void;
  setIncludeClickInRecording: (value: boolean) => void;
  setClickVolumeInRecording: (value: number) => void;
  setLiveWaveform: (value: boolean) => void;
  setAudioAfterAnalysis: (value: 'compress' | 'keep-raw' | 'delete') => void;
  setRawPcmRetentionDays: (value: number) => void;
  setScoringWindowPct: (value: number) => void;
  setFlamMergePct: (value: number) => void;
  setNoiseGate: (value: number) => void;
  setAccentThreshold: (value: number) => void;
  setHighPassHz: (value: number) => void;
  setNoiseFloorMultiplier: (value: number) => void;
  setMinOnsetIntervalMs: (value: number) => void;
  setPostHitMaskingMs: (value: number) => void;
  setPostHitMaskingStrength: (value: number) => void;
  setFluxThresholdOffset: (value: number) => void;
  setDetectionPreset: (name: string) => void;
  resetToDefaults: () => void;
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
      accents.push(VolumeState.ACCENT);
    } else if (groupStarts.has(beatNum)) {
      accents.push(VolumeState.LOUD);
    } else {
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
