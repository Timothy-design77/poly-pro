/**
 * Analysis type definitions for Poly Pro v2.
 *
 * All timing values in seconds (AudioContext time) unless noted.
 * All deviation/offset values in milliseconds.
 */

// ─── Onset Types ───

/** A single detected drum hit from post-processing */
export interface DetectedOnset {
  /** Onset time in seconds (relative to recording start) */
  time: number;
  /** Peak amplitude at onset (0–1 scale) */
  peak: number;
  /** Spectral flux value at this onset */
  flux: number;
  /** Whether this onset was merged from a flam */
  isFlam: boolean;
}

/** A scored onset after grid alignment */
export interface ScoredOnset {
  /** Onset time in seconds (relative to recording start) */
  time: number;
  /** Deviation from nearest grid line in ms (positive = late, negative = early) */
  delta: number;
  /** Absolute deviation in ms */
  absDelta: number;
  /** Peak amplitude (0–1) */
  peak: number;
  /** The beat grid time this onset was matched to (seconds) */
  matchedBeatTime: number;
  /** Beat index this onset matched within the measure */
  matchedBeatIndex: number;
  /** Whether this onset passed the scoring window */
  scored: boolean;
  /** Position within measure (0–1 fraction) */
  measurePosition: number;
  /** Spectral features (for instrument classification) */
  spectralFeatures: SpectralFeatures | null;
  /** Classified instrument label (Phase 8) */
  instrumentLabel?: string;
  /** Classification confidence (0–1) */
  instrumentConfidence?: number;
  /** Top 3 instrument candidates with scores */
  instrumentCandidates?: Array<{ label: string; score: number }>;
}

/** Spectral features extracted per onset (Phase 8 classification input) */
export interface SpectralFeatures {
  centroid: number;
  bandwidth: number;
  rolloff: number;
  zeroCrossingRate: number;
  /** Energy per band: [sub-bass, low, mid, hi-mid, high] */
  bandEnergy: [number, number, number, number, number];
  attackTime: number;
  /** Band-isolated features for simultaneous hit detection (Phase 8 enhancement) */
  bandIsolated?: BandIsolatedFeatures;
}

/** Features extracted from band-pass filtered signal (pseudo-separation) */
export interface BandIsolatedFeatures {
  /** Low band (0–500Hz): kick drum region */
  low: BandSubFeatures;
  /** Mid band (500–4kHz): snare body region */
  mid: BandSubFeatures;
  /** High band (4kHz+): cymbal/hi-hat region */
  high: BandSubFeatures;
}

export interface BandSubFeatures {
  /** Proportion of total onset energy in this band */
  energyRatio: number;
  /** Spectral centroid within this band */
  centroid: number;
  /** Attack time in this band (ms) */
  attackTime: number;
  /** Whether this band has significant energy (above noise threshold) */
  active: boolean;
}

// ─── Grid Types ───

/** A single expected beat position on the grid */
export interface GridBeat {
  /** Time in seconds from recording start */
  time: number;
  /** Beat index within the measure (0-based, includes subdivisions) */
  beatIndex: number;
  /** Measure number (0-based) */
  measure: number;
  /** Whether this is a main beat (vs subdivision) */
  isMainBeat: boolean;
  /** Whether this is beat 0 of the measure (downbeat) */
  isDownbeat: boolean;
  /** Track ID */
  trackId: string;
}

// ─── Scoring Types ───

/** Full analysis result for a session */
export interface SessionAnalysis {
  /** Overall score (0–100) */
  score: number;
  /** Consistency: standard deviation of timing deviations in ms — PRIMARY METRIC */
  sigma: number;
  /** Mean timing offset in ms (positive = late, negative = early) */
  meanOffset: number;
  /** Mean absolute deviation in ms */
  meanAbsDelta: number;
  /** Hit rate: scored onsets / total expected beats (0–1) */
  hitRate: number;
  /** Percentage of hits within scoring window */
  perfectPct: number;
  /** Percentage of hits within 1.5× scoring window */
  goodPct: number;
  /** Total detected onsets (including unscored) */
  totalDetected: number;
  /** Total scored onsets */
  totalScored: number;
  /** Total expected beats on the grid */
  totalExpected: number;
  /** Session duration in ms */
  durationMs: number;
  /** BPM used */
  bpm: number;
  /** Scoring window in ms (tempo-scaled) */
  scoringWindowMs: number;
  /** Flam merge window in ms (tempo-scaled) */
  flamMergeMs: number;
  /** Noise floor energy estimated from silence */
  noiseFloor: number;
  /** Auto-detected latency offset in ms (from click bleed, or 0) */
  autoLatencyMs: number;
  /** All scored onsets */
  scoredOnsets: ScoredOnset[];
  /** All raw detected onsets (before grid alignment) */
  rawOnsets: DetectedOnset[];
  /** Sigma level label */
  sigmaLevel: SigmaLevel;
  /** Fatigue ratio: last-quarter σ / first-quarter σ */
  fatigueRatio: number;
  /** Maximum drift from 0 in ms (smoothed running average) */
  maxDrift: number;
  /** Auto-generated text headlines with chart link tags */
  headlines: HeadlineItem[];

  // ─── Phase 9: Groove Metrics ───
  /** Swing ratio: long/short 8th-note pair ratio. 1.0 = straight */
  swingRatio?: number;
  /** Swing consistency (σ of per-pair ratios) */
  swingSigma?: number;
  /** Whether swing was detected */
  hasSwing?: boolean;
  /** Groove consistency: Pearson r across measures (null if <16 measures) */
  grooveConsistency?: number | null;

  // ─── Phase 9: Dynamics Metrics ───
  /** Accent adherence: % of accent beats played louder (0–1, null if not enough data) */
  accentAdherence?: number | null;
  /** Dynamic range: 95th/5th percentile energy ratio */
  dynamicRange?: number | null;
  /** Velocity decay slope (energy per second, negative = getting softer) */
  velocityDecaySlope?: number | null;
  /** Velocity decay label */
  velocityDecayLabel?: string;
}

/** Headline with optional chart tab link */
export interface HeadlineItem {
  text: string;
  /** Which chart tab/section to jump to when tapped */
  link?: 'distribution' | 'fatigue' | 'per-beat' | 'drift' | 'push-pull' | 'swing';
}

/** Sigma quality level */
export type SigmaLevel =
  | 'Professional'   // σ ≤ 10ms
  | 'Advanced'       // σ ≤ 20ms
  | 'Intermediate'   // σ ≤ 35ms
  | 'Developing'     // σ ≤ 50ms
  | 'Beginner';      // σ > 50ms

export function getSigmaLevel(sigma: number): SigmaLevel {
  if (sigma <= 10) return 'Professional';
  if (sigma <= 20) return 'Advanced';
  if (sigma <= 35) return 'Intermediate';
  if (sigma <= 50) return 'Developing';
  return 'Beginner';
}

// ─── Analysis Configuration ───

/** Detection parameters (tempo-scaled) */
export interface AnalysisConfig {
  /** Scoring window as percentage of IOI (default 5%) */
  scoringWindowPct: number;
  /** Flam merge as percentage of subdivision IOI (default 45%) */
  flamMergePct: number;
  /** Noise gate energy threshold (default 0.01) */
  noiseGate: number;
  /** Accent threshold multiplier (default 1.5) */
  accentThreshold: number;
  /** High-pass filter cutoff in Hz (0 = disabled) */
  highPassHz: number;
  /** Band-pass center frequency in Hz (0 = off) */
  bandPassHz: number;
  /** Manual latency offset in ms */
  latencyOffsetMs: number;
  /** Manual bias correction in ms (-50 to +50) */
  biasCorrection: number;
  /** Input gain multiplier (0.5-3.0) */
  inputGain: number;
  /** Sample rate of the recording */
  sampleRate: number;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  scoringWindowPct: 5,
  flamMergePct: 45,
  noiseGate: 0.01,
  accentThreshold: 1.5,
  highPassHz: 0,
  bandPassHz: 0,
  latencyOffsetMs: 0,
  biasCorrection: 0,
  inputGain: 1.0,
  sampleRate: 48000,
};

// ─── Detection Presets ───

export type DetectionPresetName = 'Standard' | 'Strict' | 'Forgiving' | 'Noisy Room' | 'Custom';

export interface DetectionPreset {
  name: DetectionPresetName;
  scoringWindowPct: number;
  flamMergePct: number;
  noiseGate: number;
  highPassHz: number;
  description: string;
}

export const DETECTION_PRESETS: DetectionPreset[] = [
  {
    name: 'Standard',
    scoringWindowPct: 5,
    flamMergePct: 45,
    noiseGate: 0.01,
    highPassHz: 0,
    description: 'Default — sensitive, suits most rooms',
  },
  {
    name: 'Strict',
    scoringWindowPct: 2,
    flamMergePct: 25,
    noiseGate: 0.03,
    highPassHz: 0,
    description: 'Advanced players, quiet rooms, tight windows',
  },
  {
    name: 'Forgiving',
    scoringWindowPct: 8,
    flamMergePct: 60,
    noiseGate: 0.005,
    highPassHz: 0,
    description: 'Beginners — max sensitivity, wide windows',
  },
  {
    name: 'Noisy Room',
    scoringWindowPct: 6,
    flamMergePct: 45,
    noiseGate: 0.10,
    highPassHz: 150,
    description: 'Raised gate + 150Hz high-pass for noisy spaces',
  },
];

// ─── Analysis Progress ───

export type AnalysisStage =
  | 'noise-floor'
  | 'latency-detect'
  | 'coarse-onset'
  | 'fine-onset'
  | 'flam-analysis'
  | 'spectral-features'
  | 'grid-scoring'
  | 'complete';

export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  'noise-floor': 'Estimating noise floor…',
  'latency-detect': 'Detecting latency…',
  'coarse-onset': 'Detecting onsets…',
  'fine-onset': 'Refining onset timing…',
  'flam-analysis': 'Analyzing flams…',
  'spectral-features': 'Extracting features…',
  'grid-scoring': 'Computing score…',
  'complete': 'Done',
};

export interface AnalysisProgress {
  stage: AnalysisStage;
  progress: number; // 0–1
}
