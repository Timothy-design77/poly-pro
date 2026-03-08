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
  /** Spectral features (for future instrument classification) */
  spectralFeatures: SpectralFeatures | null;
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
  /** Auto-generated text headlines */
  headlines: string[];
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
  /** Noise gate energy threshold (default 0.05) */
  noiseGate: number;
  /** Accent threshold multiplier (default 1.5) */
  accentThreshold: number;
  /** High-pass filter cutoff in Hz (0 = disabled) */
  highPassHz: number;
  /** Manual latency offset in ms */
  latencyOffsetMs: number;
  /** Sample rate of the recording */
  sampleRate: number;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  scoringWindowPct: 5,
  flamMergePct: 45,
  noiseGate: 0.05,
  accentThreshold: 1.5,
  highPassHz: 0,
  latencyOffsetMs: 0,
  sampleRate: 48000,
};

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
