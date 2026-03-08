/**
 * Analysis Pipeline Orchestrator
 *
 * Ties together onset detection + grid generation + scoring
 * into a single async function that runs after recording stops.
 *
 * Input: raw PCM blob from IDB + session parameters
 * Output: SessionAnalysis with all metrics + scored onsets
 */

import { runOnsetDetection } from './onset-detection';
import { computeSessionAnalysis } from './scoring';
import { gridFromScheduledBeats, gridFromParams } from './grid';
import type { SessionAnalysis, AnalysisConfig, AnalysisProgress } from './types';
import { DEFAULT_ANALYSIS_CONFIG } from './types';
import type { ScheduledBeat } from '../audio/types';

export interface AnalyzeSessionParams {
  /** Raw PCM audio blob from IDB */
  pcmBlob: Blob;
  /** BPM during recording */
  bpm: number;
  /** Meter numerator */
  meterNumerator: number;
  /** Meter denominator */
  meterDenominator: number;
  /** Subdivision factor */
  subdivision: number;
  /** Session duration in ms */
  durationMs: number;
  /** Scheduled beats captured during recording (from engine) */
  scheduledBeats: ScheduledBeat[];
  /** AudioContext time when recording started */
  recordingStartTime: number;
  /** AudioContext time when recording ended */
  recordingEndTime: number;
  /** Optional analysis config overrides */
  config?: Partial<AnalysisConfig>;
  /** Progress callback */
  onProgress?: (progress: AnalysisProgress) => void;
}

/**
 * Run the complete analysis pipeline on a recorded session.
 *
 * This is the main entry point called after recording stops.
 * Runs on the main thread with periodic yields to keep UI responsive.
 * For very long sessions (>10min), may take 10-30 seconds.
 */
export async function analyzeSession(
  params: AnalyzeSessionParams,
): Promise<SessionAnalysis> {
  const {
    pcmBlob,
    bpm,
    meterNumerator,
    subdivision,
    durationMs,
    scheduledBeats,
    recordingStartTime,
    recordingEndTime,
    onProgress,
  } = params;

  const config: AnalysisConfig = {
    ...DEFAULT_ANALYSIS_CONFIG,
    ...params.config,
  };

  // 1. Decode PCM blob to Float32Array
  const arrayBuffer = await pcmBlob.arrayBuffer();
  const pcm = new Float32Array(arrayBuffer);

  if (pcm.length < config.sampleRate * 0.5) {
    // Less than 0.5 seconds — return empty analysis
    return emptyAnalysis(bpm, durationMs);
  }

  // 2. Build beat grid
  let grid;
  if (scheduledBeats.length > 0) {
    // Preferred: use actual engine-captured beat times
    grid = gridFromScheduledBeats(
      scheduledBeats,
      recordingStartTime,
      recordingEndTime,
      subdivision,
    );
  } else {
    // Fallback: generate from BPM/meter params
    const durationSeconds = pcm.length / config.sampleRate;
    grid = gridFromParams(bpm, meterNumerator, subdivision, durationSeconds);
  }

  if (grid.length === 0) {
    return emptyAnalysis(bpm, durationMs);
  }

  // 3. Run onset detection pipeline (Stages 1–6)
  const detectionResult = await runOnsetDetection(
    pcm,
    config,
    bpm,
    subdivision,
    onProgress,
  );

  // 4. Run scoring (Stage 7)
  const analysis = computeSessionAnalysis(
    detectionResult.onsets,
    grid,
    config,
    bpm,
    subdivision,
    durationMs,
    onProgress,
  );

  // Patch in detection-level values
  analysis.noiseFloor = detectionResult.noiseFloor;
  analysis.autoLatencyMs = detectionResult.autoLatencyMs;

  return analysis;
}

/**
 * Return an empty/zero analysis for degenerate cases.
 */
function emptyAnalysis(bpm: number, durationMs: number): SessionAnalysis {
  return {
    score: 0,
    sigma: 0,
    meanOffset: 0,
    meanAbsDelta: 0,
    hitRate: 0,
    perfectPct: 0,
    goodPct: 0,
    totalDetected: 0,
    totalScored: 0,
    totalExpected: 0,
    durationMs,
    bpm,
    scoringWindowMs: 0,
    flamMergeMs: 0,
    noiseFloor: 0,
    autoLatencyMs: 0,
    scoredOnsets: [],
    rawOnsets: [],
    sigmaLevel: 'Beginner',
    fatigueRatio: 1,
    maxDrift: 0,
    headlines: [{ text: 'Session too short for analysis' }],
  };
}
