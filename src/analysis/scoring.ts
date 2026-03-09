/**
 * Scoring Engine — Grid Alignment + Score Computation
 *
 * Stage 7 of the post-processing pipeline.
 *
 * Takes detected onsets + beat grid → scored onsets + session metrics.
 *
 * Key design decisions:
 * - Scoring window scales with tempo (% of IOI, not fixed ms)
 * - σ (standard deviation of deviations) is the PRIMARY metric
 * - Being consistently early/late is a style choice, not penalized by σ
 * - Hit rate affects final score as a multiplier
 */

import type {
  DetectedOnset,
  ScoredOnset,
  GridBeat,
  SessionAnalysis,
  AnalysisConfig,
  AnalysisProgress,
} from './types';
import { getSigmaLevel } from './types';
import { computeScoringWindowS } from './grid';
import { computeGrooveMetrics } from './groove';
import { computeDynamicsMetrics } from './dynamics';

type ProgressCallback = (progress: AnalysisProgress) => void;

// ─── Grid Alignment ───

/**
 * Align detected onsets to the beat grid.
 *
 * For each onset, find the nearest grid beat within the scoring window.
 * Each grid beat can only be matched once (greedy nearest-first).
 *
 * @param onsets - Detected onsets from pipeline
 * @param grid - Expected beat positions
 * @param scoringWindowS - Max distance from grid to be scored (seconds)
 * @param latencyOffsetS - Latency correction to apply (seconds, subtracted from onset time)
 */
export function alignToGrid(
  onsets: DetectedOnset[],
  grid: GridBeat[],
  scoringWindowS: number,
  latencyOffsetS: number,
): ScoredOnset[] {
  const scored: ScoredOnset[] = [];
  const claimedBeats = new Set<number>(); // Indices into grid[] already matched

  // Sort onsets by time
  const sortedOnsets = [...onsets].sort((a, b) => a.time - b.time);

  // Pre-compute measure duration from grid for position calculation
  const measureDuration = grid.length >= 2
    ? estimateMeasureDuration(grid)
    : 1;

  for (const onset of sortedOnsets) {
    const correctedTime = onset.time - latencyOffsetS;

    // Find nearest unclaimed grid beat
    let bestGridIdx = -1;
    let bestDist = Infinity;

    for (let g = 0; g < grid.length; g++) {
      if (claimedBeats.has(g)) continue;

      const dist = Math.abs(correctedTime - grid[g].time);
      if (dist < bestDist) {
        bestDist = dist;
        bestGridIdx = g;
      }

      // Early exit: if distances are increasing, we've passed the best
      if (dist > bestDist + scoringWindowS * 2) break;
    }

    const withinWindow = bestDist <= scoringWindowS;
    const gridBeat = bestGridIdx >= 0 ? grid[bestGridIdx] : null;

    if (gridBeat && withinWindow) {
      claimedBeats.add(bestGridIdx);

      const deltaMs = (correctedTime - gridBeat.time) * 1000; // positive = late

      // Measure position: fraction 0–1 within the measure
      const measureStartBeat = grid.find(
        (b) => b.measure === gridBeat.measure && b.beatIndex === 0,
      );
      let measurePos = 0;
      if (measureStartBeat && measureDuration > 0) {
        measurePos = (correctedTime - measureStartBeat.time) / measureDuration;
        measurePos = Math.max(0, Math.min(1, measurePos));
      }

      scored.push({
        time: onset.time,
        delta: deltaMs,
        absDelta: Math.abs(deltaMs),
        peak: onset.peak,
        matchedBeatTime: gridBeat.time,
        matchedBeatIndex: gridBeat.beatIndex,
        scored: true,
        measurePosition: measurePos,
        spectralFeatures: null,
      });
    } else {
      // Unscored: outside all scoring windows (extra hit or noise)
      scored.push({
        time: onset.time,
        delta: gridBeat ? (correctedTime - gridBeat.time) * 1000 : 0,
        absDelta: gridBeat ? Math.abs(correctedTime - gridBeat.time) * 1000 : 0,
        peak: onset.peak,
        matchedBeatTime: gridBeat?.time ?? 0,
        matchedBeatIndex: gridBeat?.beatIndex ?? -1,
        scored: false,
        measurePosition: 0,
        spectralFeatures: null,
      });
    }
  }

  return scored;
}

/**
 * Estimate measure duration from grid beats.
 */
function estimateMeasureDuration(grid: GridBeat[]): number {
  // Find first two downbeats
  const downbeats = grid.filter((b) => b.isDownbeat);
  if (downbeats.length >= 2) {
    return downbeats[1].time - downbeats[0].time;
  }
  // Fallback: total grid span / number of measures
  if (grid.length >= 2) {
    const measures = grid[grid.length - 1].measure + 1;
    return (grid[grid.length - 1].time - grid[0].time) / Math.max(1, measures);
  }
  return 1;
}

// ─── Score Computation ───

/**
 * Compute the overall session score from consistency (σ).
 *
 * Score breakdown:
 *   σ ≤ 10ms:  95 + (10 - σ) × 0.5    → 95–100
 *   σ ≤ 20ms:  80 + (20 - σ) × 1.5    → 80–95
 *   σ ≤ 35ms:  60 + (35 - σ) × 1.33   → 60–80
 *   σ ≤ 50ms:  40 + (50 - σ) × 1.33   → 40–60
 *   σ > 50ms:  max(10, 40 - (σ - 50))  → 10–40
 *
 * Modifiers:
 *   - Hit rate penalty: score × (hitRate)
 *   - NMA bonus: +2 if |meanOffset| < 5ms after calibration
 *   - Accent bonus: +3 if accentAdherence > 80% (Phase 9)
 */
function computeBaseScore(sigma: number): number {
  if (sigma <= 10) return 95 + (10 - sigma) * 0.5;
  if (sigma <= 20) return 80 + (20 - sigma) * 1.5;
  if (sigma <= 35) return 60 + (35 - sigma) * 1.33;
  if (sigma <= 50) return 40 + (50 - sigma) * 1.33;
  return Math.max(10, 40 - (sigma - 50));
}

// ─── Fatigue Analysis ───

/**
 * Compute fatigue ratio: last-quarter σ / first-quarter σ.
 * Values > 1 indicate timing degraded over the session.
 */
function computeFatigueRatio(scoredOnsets: ScoredOnset[]): number {
  const scored = scoredOnsets.filter((o) => o.scored);
  if (scored.length < 8) return 1.0;

  const quarter = Math.floor(scored.length / 4);
  const firstQuarter = scored.slice(0, quarter);
  const lastQuarter = scored.slice(-quarter);

  const firstSigma = computeSigma(firstQuarter.map((o) => o.delta));
  const lastSigma = computeSigma(lastQuarter.map((o) => o.delta));

  if (firstSigma < 0.5) return 1.0; // Avoid division by near-zero
  return lastSigma / firstSigma;
}

/**
 * Compute standard deviation of an array of values.
 */
function computeSigma(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) * (v - mean), 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

// ─── Drift Computation ───

/**
 * Compute max drift — the largest smoothed running average offset from 0.
 */
function computeMaxDrift(scoredOnsets: ScoredOnset[]): number {
  const scored = scoredOnsets.filter((o) => o.scored);
  if (scored.length < 10) return 0;

  const windowSize = Math.min(10, Math.max(3, Math.floor(scored.length / 10)));
  let maxDrift = 0;

  for (let i = 0; i <= scored.length - windowSize; i++) {
    const window = scored.slice(i, i + windowSize);
    const avg = window.reduce((s, o) => s + o.delta, 0) / window.length;
    if (Math.abs(avg) > Math.abs(maxDrift)) maxDrift = avg;
  }

  return maxDrift;
}

// ─── Headline Generation ───

import type { HeadlineItem } from './types';

function generateHeadlines(
  analysis: Omit<SessionAnalysis, 'headlines'>,
): HeadlineItem[] {
  const headlines: HeadlineItem[] = [];

  // 1. Personal best check — σ quality level
  if (analysis.sigma <= 10) {
    headlines.push({
      text: `Professional-level consistency: σ = ${analysis.sigma.toFixed(1)}ms`,
      link: 'distribution',
    });
  } else if (analysis.sigma <= 20) {
    headlines.push({
      text: `Tight timing: σ = ${analysis.sigma.toFixed(1)}ms`,
      link: 'distribution',
    });
  }

  // 2. Fatigue
  if (analysis.fatigueRatio > 1.4) {
    const degradePct = Math.round((analysis.fatigueRatio - 1) * 100);
    headlines.push({
      text: `Timing degraded ${degradePct}% toward session end`,
      link: 'fatigue',
    });
  } else if (analysis.fatigueRatio < 0.8 && analysis.totalScored > 20) {
    headlines.push({
      text: 'Timing improved as session progressed',
      link: 'fatigue',
    });
  }

  // 3. Systematic bias
  if (Math.abs(analysis.meanOffset) > 15) {
    const dir = analysis.meanOffset > 0 ? 'late' : 'early';
    headlines.push({
      text: `Systematic ${dir} bias: ${Math.abs(analysis.meanOffset).toFixed(1)}ms average`,
      link: 'push-pull',
    });
  } else if (Math.abs(analysis.meanOffset) < 5 && analysis.totalScored > 10) {
    headlines.push({
      text: 'Excellent center — minimal timing bias',
      link: 'distribution',
    });
  }

  // 4. Drift
  if (Math.abs(analysis.maxDrift) > 30) {
    const dir = analysis.maxDrift > 0 ? 'late' : 'early';
    headlines.push({
      text: `Tempo drifted ${Math.abs(analysis.maxDrift).toFixed(0)}ms ${dir} during session`,
      link: 'drift',
    });
  }

  // 5. Hit rate
  if (analysis.hitRate < 0.90 && analysis.totalExpected > 10) {
    const missed = analysis.totalExpected - analysis.totalScored;
    headlines.push({
      text: `Missed ${missed} beats — ${Math.round(analysis.hitRate * 100)}% hit rate`,
      link: 'per-beat',
    });
  }

  // 6. Perfect percentage
  if (analysis.perfectPct > 90) {
    headlines.push({
      text: `${Math.round(analysis.perfectPct)}% of hits within scoring window`,
      link: 'distribution',
    });
  }

  // 7. First session at this tempo
  if (analysis.totalScored > 0 && analysis.totalScored < 50) {
    headlines.push({
      text: `First session at ${analysis.bpm} BPM — baseline established`,
    });
  }

  // 8. Swing (Phase 9)
  if (analysis.hasSwing && analysis.swingRatio) {
    const swingPct = Math.round((analysis.swingRatio - 1) * 100);
    headlines.push({
      text: `Swing detected: ${analysis.swingRatio.toFixed(2)} ratio (${swingPct}% swing)`,
      link: 'swing',
    });
  }

  // 9. Groove consistency (Phase 9)
  if (analysis.grooveConsistency !== null && analysis.grooveConsistency !== undefined) {
    if (analysis.grooveConsistency > 0.8) {
      headlines.push({
        text: `Very consistent groove pattern (r = ${analysis.grooveConsistency.toFixed(2)})`,
        link: 'push-pull',
      });
    } else if (analysis.grooveConsistency < 0.3) {
      headlines.push({
        text: `Groove varies a lot measure-to-measure (r = ${analysis.grooveConsistency.toFixed(2)})`,
        link: 'push-pull',
      });
    }
  }

  // 10. Accent adherence (Phase 9)
  if (analysis.accentAdherence !== null && analysis.accentAdherence !== undefined) {
    if (analysis.accentAdherence > 0.8) {
      headlines.push({
        text: `Strong accent adherence: ${Math.round(analysis.accentAdherence * 100)}% of downbeats louder`,
      });
    }
  }

  // Limit to 5 headlines max
  return headlines.slice(0, 5);
}

// ─── Full Scoring Pipeline ───

/**
 * Run the complete scoring computation.
 *
 * @param rawOnsets - Detected onsets from onset-detection pipeline
 * @param grid - Beat grid from grid.ts
 * @param config - Analysis parameters
 * @param bpm - Session BPM
 * @param subdivision - Subdivision factor
 * @param durationMs - Session duration in milliseconds
 * @param onProgress - Progress callback
 */
export function computeSessionAnalysis(
  rawOnsets: DetectedOnset[],
  grid: GridBeat[],
  config: AnalysisConfig,
  bpm: number,
  subdivision: number,
  durationMs: number,
  onProgress?: ProgressCallback,
): SessionAnalysis {
  onProgress?.({ stage: 'grid-scoring', progress: 0 });

  // Compute tempo-scaled windows
  const scoringWindowS = computeScoringWindowS(bpm, subdivision, config.scoringWindowPct);
  const scoringWindowMs = scoringWindowS * 1000;
  const flamMergeS = (60 / bpm / subdivision) * (config.flamMergePct / 100);
  const flamMergeMs = flamMergeS * 1000;

  // Latency offset in seconds
  const latencyOffsetS = config.latencyOffsetMs / 1000;

  // Align onsets to grid
  const scoredOnsets = alignToGrid(rawOnsets, grid, scoringWindowS, latencyOffsetS);

  onProgress?.({ stage: 'grid-scoring', progress: 0.5 });

  // Compute metrics from scored onsets
  const scored = scoredOnsets.filter((o) => o.scored);
  const deltas = scored.map((o) => o.delta);

  // Primary metric: σ (standard deviation of deviations)
  const sigma = deltas.length >= 2 ? computeSigma(deltas) : 0;

  // Mean offset (positive = late on average)
  const meanOffset =
    deltas.length > 0
      ? deltas.reduce((s, d) => s + d, 0) / deltas.length
      : 0;

  // Mean absolute delta
  const meanAbsDelta =
    deltas.length > 0
      ? deltas.reduce((s, d) => s + Math.abs(d), 0) / deltas.length
      : 0;

  // Hit rate: scored onsets / expected beats (only main beats for now)
  const expectedBeats = grid.length;
  const hitRate = expectedBeats > 0 ? scored.length / expectedBeats : 0;

  // Perfect: within scoring window
  const perfectCount = scored.filter(
    (o) => o.absDelta <= scoringWindowMs,
  ).length;
  const perfectPct = scored.length > 0 ? (perfectCount / scored.length) * 100 : 0;

  // Good: within 1.5× scoring window
  const goodCount = scored.filter(
    (o) => o.absDelta <= scoringWindowMs * 1.5,
  ).length;
  const goodPct = scored.length > 0 ? (goodCount / scored.length) * 100 : 0;

  // Compute score
  // Fatigue
  const fatigueRatio = computeFatigueRatio(scoredOnsets);

  // Drift
  const maxDrift = computeMaxDrift(scoredOnsets);

  // Phase 9: Groove metrics
  const beatsPerMeasure = grid.length > 0
    ? Math.max(...grid.filter((b) => b.measure === 0).map((b) => b.beatIndex)) + 1
    : 4;
  const grooveMetrics = computeGrooveMetrics(scoredOnsets, bpm, subdivision, beatsPerMeasure);

  // Phase 9: Dynamics metrics
  const dynamicsMetrics = computeDynamicsMetrics(scoredOnsets, subdivision);

  // ─── Score computation (after all metrics) ───
  let score = computeBaseScore(sigma);

  // Hit rate penalty
  score *= Math.min(1, hitRate);

  // NMA bonus: centered timing
  if (Math.abs(meanOffset) < 5 && scored.length > 10) {
    score += 2;
  }

  // Accent bonus: clear dynamic contrast
  if (dynamicsMetrics.accentAdherence !== null && dynamicsMetrics.accentAdherence > 0.80) {
    score += 3;
  }

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  onProgress?.({ stage: 'grid-scoring', progress: 1 });

  const noiseFloor = 0; // Already computed upstream, passed through
  const autoLatencyMs = 0; // From onset detection

  const partialAnalysis = {
    score,
    sigma,
    meanOffset,
    meanAbsDelta,
    hitRate,
    perfectPct,
    goodPct,
    totalDetected: rawOnsets.length,
    totalScored: scored.length,
    totalExpected: expectedBeats,
    durationMs,
    bpm,
    scoringWindowMs,
    flamMergeMs,
    noiseFloor,
    autoLatencyMs,
    scoredOnsets,
    rawOnsets,
    sigmaLevel: getSigmaLevel(sigma),
    fatigueRatio,
    maxDrift,
    headlines: [] as HeadlineItem[],
    // Phase 9: Groove
    swingRatio: grooveMetrics.swingRatio,
    swingSigma: grooveMetrics.swingSigma,
    hasSwing: grooveMetrics.hasSwing,
    grooveConsistency: grooveMetrics.grooveConsistency,
    // Phase 9: Dynamics
    accentAdherence: dynamicsMetrics.accentAdherence,
    dynamicRange: dynamicsMetrics.dynamicRange,
    velocityDecaySlope: dynamicsMetrics.velocityDecaySlope,
    velocityDecayLabel: dynamicsMetrics.decayLabel,
  };

  // Generate headlines
  partialAnalysis.headlines = generateHeadlines(partialAnalysis);

  onProgress?.({ stage: 'complete', progress: 1 });

  return partialAnalysis;
}
