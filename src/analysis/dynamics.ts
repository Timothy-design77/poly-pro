/**
 * Dynamics Analysis — Phase 9
 *
 * ⚠️ YELLOW metrics — depend on Phase D validation (AGC test).
 * If AGC can't be disabled on user's device, these metrics will be noisy.
 * Shipped as "informational" with appropriate caveats in the UI.
 *
 * Computes:
 * - Accent adherence: % of accent beats played louder than non-accent beats
 * - Dynamic range: 95th/5th percentile energy ratio
 * - Velocity decay: energy slope over session (informational)
 */

import type { ScoredOnset } from './types';

// ─── Types ───

export interface DynamicsMetrics {
  /** % of accent beats that were played louder than the median non-accent hit (0–1) */
  accentAdherence: number | null;
  /** Number of accent beats detected */
  accentBeatCount: number;
  /** Number of non-accent beats detected */
  nonAccentBeatCount: number;
  /** 95th/5th percentile energy ratio. Higher = more dynamic contrast */
  dynamicRange: number | null;
  /** Linear regression slope of peak energy over time (per second). Negative = getting softer */
  velocityDecaySlope: number | null;
  /** Whether the velocity decay is significant enough to display */
  hasSignificantDecay: boolean;
  /** Velocity decay label for display */
  decayLabel: string;
}

// ─── Accent Adherence ───

/**
 * Compute accent adherence.
 *
 * Uses beat position to determine which beats should be accented
 * (beat 0 = downbeat = accent). Then checks if the player's peak
 * amplitude on accent beats exceeds the median of non-accent beats.
 *
 * @param scoredOnsets - Scored onsets with peak amplitude
 * @param subdivision - Subdivision factor (accent beats are at subdivision boundaries)
 */
function computeAccentAdherence(
  scoredOnsets: ScoredOnset[],
  subdivision: number,
): { accentAdherence: number | null; accentBeatCount: number; nonAccentBeatCount: number } {
  const scored = scoredOnsets.filter((o) => o.scored);
  if (scored.length < 10) {
    return { accentAdherence: null, accentBeatCount: 0, nonAccentBeatCount: 0 };
  }

  // Accent beats: beat 0 (downbeat) and main beat positions
  const accentHits: number[] = [];
  const nonAccentHits: number[] = [];

  for (const o of scored) {
    const isAccentBeat = o.matchedBeatIndex % subdivision === 0 && o.matchedBeatIndex === 0;
    const isMainBeat = o.matchedBeatIndex % subdivision === 0;

    if (isAccentBeat) {
      accentHits.push(o.peak);
    } else if (!isMainBeat) {
      nonAccentHits.push(o.peak);
    }
  }

  // If we only have main beats but no subdivisions, compare downbeats vs others
  if (nonAccentHits.length < 3) {
    // Retry: downbeats vs all non-downbeat main beats
    accentHits.length = 0;
    nonAccentHits.length = 0;

    for (const o of scored) {
      const isDownbeat = o.matchedBeatIndex % subdivision === 0 &&
        Math.floor(o.matchedBeatIndex / subdivision) === 0;
      if (isDownbeat) {
        accentHits.push(o.peak);
      } else {
        nonAccentHits.push(o.peak);
      }
    }
  }

  if (accentHits.length < 3 || nonAccentHits.length < 3) {
    return {
      accentAdherence: null,
      accentBeatCount: accentHits.length,
      nonAccentBeatCount: nonAccentHits.length,
    };
  }

  // Median of non-accent peaks
  const sortedNonAccent = [...nonAccentHits].sort((a, b) => a - b);
  const medianNonAccent = sortedNonAccent[Math.floor(sortedNonAccent.length / 2)];

  // Count accent hits that exceed the median
  const louderCount = accentHits.filter((p) => p > medianNonAccent).length;
  const accentAdherence = louderCount / accentHits.length;

  return {
    accentAdherence: Math.round(accentAdherence * 100) / 100,
    accentBeatCount: accentHits.length,
    nonAccentBeatCount: nonAccentHits.length,
  };
}

// ─── Dynamic Range ───

/**
 * Compute dynamic range as 95th/5th percentile energy ratio.
 */
function computeDynamicRange(
  scoredOnsets: ScoredOnset[],
): number | null {
  const scored = scoredOnsets.filter((o) => o.scored);
  if (scored.length < 20) return null;

  const peaks = scored.map((o) => o.peak).sort((a, b) => a - b);
  const p5Idx = Math.floor(peaks.length * 0.05);
  const p95Idx = Math.floor(peaks.length * 0.95);

  const p5 = peaks[p5Idx];
  const p95 = peaks[p95Idx];

  if (p5 < 0.001) return null; // Too quiet to measure
  return Math.round((p95 / p5) * 100) / 100;
}

// ─── Velocity Decay ───

/**
 * Compute velocity decay: linear regression of peak energy over time.
 *
 * Returns slope in energy-units-per-second. Negative = getting softer.
 */
function computeVelocityDecay(
  scoredOnsets: ScoredOnset[],
): { slope: number | null; hasSignificantDecay: boolean; decayLabel: string } {
  const scored = scoredOnsets.filter((o) => o.scored);
  if (scored.length < 20) {
    return { slope: null, hasSignificantDecay: false, decayLabel: 'Not enough data' };
  }

  // Simple linear regression: peak vs time
  const n = scored.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (const o of scored) {
    sumX += o.time;
    sumY += o.peak;
    sumXY += o.time * o.peak;
    sumX2 += o.time * o.time;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) {
    return { slope: null, hasSignificantDecay: false, decayLabel: 'Flat' };
  }

  const slope = (n * sumXY - sumX * sumY) / denom;

  // Compute R² to check significance
  const meanY = sumY / n;
  let ssRes = 0, ssTot = 0;
  const intercept = (sumY - slope * sumX) / n;

  for (const o of scored) {
    const predicted = intercept + slope * o.time;
    ssRes += (o.peak - predicted) ** 2;
    ssTot += (o.peak - meanY) ** 2;
  }

  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Significant if R² > 0.05 and slope is meaningful
  const hasSignificantDecay = r2 > 0.05 && Math.abs(slope) > 0.001;

  let decayLabel: string;
  if (!hasSignificantDecay) {
    decayLabel = 'Stable volume';
  } else if (slope < -0.01) {
    decayLabel = 'Volume dropping';
  } else if (slope < 0) {
    decayLabel = 'Slight fade';
  } else if (slope > 0.01) {
    decayLabel = 'Volume rising';
  } else {
    decayLabel = 'Slight build';
  }

  return {
    slope: Math.round(slope * 10000) / 10000,
    hasSignificantDecay,
    decayLabel,
  };
}

// ─── Main Entry Point ───

/**
 * Compute all dynamics metrics for a session.
 */
export function computeDynamicsMetrics(
  scoredOnsets: ScoredOnset[],
  subdivision: number,
): DynamicsMetrics {
  const {
    accentAdherence,
    accentBeatCount,
    nonAccentBeatCount,
  } = computeAccentAdherence(scoredOnsets, subdivision);

  const dynamicRange = computeDynamicRange(scoredOnsets);

  const {
    slope: velocityDecaySlope,
    hasSignificantDecay,
    decayLabel,
  } = computeVelocityDecay(scoredOnsets);

  return {
    accentAdherence,
    accentBeatCount,
    nonAccentBeatCount,
    dynamicRange,
    velocityDecaySlope,
    hasSignificantDecay,
    decayLabel,
  };
}
