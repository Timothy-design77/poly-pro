/**
 * Groove Analysis — Phase 9
 *
 * Computes:
 * - Swing ratio: long/short ratio of consecutive 8th-note pairs
 * - Push/pull profile: systematic early/late per beat position (already displayed in chart, now a metric)
 * - Groove consistency: measure-to-measure correlation (Pearson r) — needs ≥16 measures
 */

import type { ScoredOnset } from './types';

// ─── Types ───

export interface GrooveMetrics {
  /** Swing ratio: ratio of long-to-short in consecutive pairs. 1.0 = straight, ~1.67 = jazz swing */
  swingRatio: number;
  /** Standard deviation of per-pair swing ratios — how consistent the swing is */
  swingSigma: number;
  /** Whether swing was detected (ratio deviates significantly from 1.0) */
  hasSwing: boolean;
  /** Push/pull per beat position: array of { beatIndex, meanDelta, count } */
  pushPullProfile: PushPullEntry[];
  /** Groove consistency: Pearson r of timing patterns across measures. 1.0 = identical timing every measure */
  grooveConsistency: number | null;
  /** Number of complete measures used for groove consistency calculation */
  measuresUsed: number;
}

export interface PushPullEntry {
  beatIndex: number;
  meanDelta: number;
  count: number;
}

// ─── Swing Ratio ───

/**
 * Compute swing ratio from scored onsets.
 *
 * Groups consecutive pairs of subdivision beats and measures the ratio
 * of the longer interval to the shorter. For straight 8ths this is 1.0.
 * For triplet swing it's ~2.0 (2:1). Standard jazz swing is ~1.67.
 *
 * Only computed when subdivision includes 8th notes (subdivision >= 2).
 */
export function computeSwingRatio(
  scoredOnsets: ScoredOnset[],
  _bpm: number,
  subdivision: number,
): { swingRatio: number; swingSigma: number; hasSwing: boolean } {
  if (subdivision < 2) {
    return { swingRatio: 1.0, swingSigma: 0, hasSwing: false };
  }

  const scored = scoredOnsets
    .filter((o) => o.scored)
    .sort((a, b) => a.time - b.time);

  if (scored.length < 6) {
    return { swingRatio: 1.0, swingSigma: 0, hasSwing: false };
  }

  // Group by consecutive pairs based on beat index within the subdivision
  // For sub=2: beat indices 0,1 form a pair, 2,3 form a pair, etc.
  const pairs: Array<{ longInterval: number; shortInterval: number }> = [];

  for (let i = 0; i < scored.length - 2; i++) {
    const a = scored[i];
    const b = scored[i + 1];
    const c = scored[i + 2];

    // Check that a→b and b→c are consecutive subdivision beats
    const beatA = a.matchedBeatIndex;
    const beatB = b.matchedBeatIndex;
    const beatC = c.matchedBeatIndex;

    // We want pairs where beatA is even subdivision, beatB is odd, beatC is next even
    if (beatA % 2 === 0 && beatB === beatA + 1 && beatC === beatA + 2) {
      const interval1 = b.time - a.time; // first interval
      const interval2 = c.time - b.time; // second interval

      if (interval1 > 0 && interval2 > 0) {
        const longer = Math.max(interval1, interval2);
        const shorter = Math.min(interval1, interval2);
        pairs.push({ longInterval: longer, shortInterval: shorter });
      }
    }
  }

  if (pairs.length < 3) {
    return { swingRatio: 1.0, swingSigma: 0, hasSwing: false };
  }

  // Compute individual ratios and overall average
  const ratios = pairs.map((p) => p.longInterval / p.shortInterval);
  const meanRatio = ratios.reduce((s, r) => s + r, 0) / ratios.length;

  // σ of ratios
  const variance =
    ratios.reduce((s, r) => s + (r - meanRatio) ** 2, 0) / ratios.length;
  const swingSigma = Math.sqrt(variance);

  // Detect swing: ratio > 1.15 with reasonable consistency
  const hasSwing = meanRatio > 1.15 && swingSigma < 0.5;

  return {
    swingRatio: Math.round(meanRatio * 100) / 100,
    swingSigma: Math.round(swingSigma * 100) / 100,
    hasSwing,
  };
}

// ─── Push/Pull Profile ───

/**
 * Compute mean offset per beat position.
 * This data is already displayed in the PushPull chart but now also
 * stored as a metric for headline generation.
 */
export function computePushPullProfile(
  scoredOnsets: ScoredOnset[],
): PushPullEntry[] {
  const scored = scoredOnsets.filter((o) => o.scored);
  const groups = new Map<number, number[]>();

  for (const o of scored) {
    const idx = o.matchedBeatIndex;
    if (!groups.has(idx)) groups.set(idx, []);
    groups.get(idx)!.push(o.delta);
  }

  const profile: PushPullEntry[] = [];
  for (const [beatIndex, deltas] of groups) {
    if (deltas.length < 3) continue; // Need minimum samples
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;
    profile.push({ beatIndex, meanDelta, count: deltas.length });
  }

  profile.sort((a, b) => a.beatIndex - b.beatIndex);
  return profile;
}

// ─── Groove Consistency ───

/**
 * Compute groove consistency: how similar the timing pattern is across measures.
 *
 * Method: Build a timing-deviation vector per measure, then compute the
 * average pairwise Pearson correlation across all complete measures.
 *
 * Requires ≥16 complete measures.
 */
export function computeGrooveConsistency(
  scoredOnsets: ScoredOnset[],
  beatsPerMeasure: number,
): { grooveConsistency: number | null; measuresUsed: number } {
  const scored = scoredOnsets.filter((o) => o.scored);

  if (beatsPerMeasure < 2) {
    return { grooveConsistency: null, measuresUsed: 0 };
  }

  // Group onsets by measure (using measurePosition and matchedBeatIndex)
  // Build a vector of deltas per measure, indexed by beat position
  const measures = new Map<number, Map<number, number>>();

  for (const o of scored) {
    // Estimate measure number from matchedBeatTime
    const measureNum = Math.floor(o.matchedBeatIndex / beatsPerMeasure);
    const posInMeasure = o.matchedBeatIndex % beatsPerMeasure;

    if (!measures.has(measureNum)) measures.set(measureNum, new Map());
    measures.get(measureNum)!.set(posInMeasure, o.delta);
  }

  // Filter to complete measures (all beat positions have a hit)
  const completeMeasures: number[][] = [];
  for (const [, beatMap] of measures) {
    if (beatMap.size >= beatsPerMeasure) {
      const vec: number[] = [];
      for (let i = 0; i < beatsPerMeasure; i++) {
        vec.push(beatMap.get(i) ?? 0);
      }
      completeMeasures.push(vec);
    }
  }

  if (completeMeasures.length < 16) {
    return { grooveConsistency: null, measuresUsed: completeMeasures.length };
  }

  // Compute average pairwise Pearson r
  let totalR = 0;
  let pairCount = 0;

  // Sample pairs if there are too many measures (cap at 100 pairs)
  const maxPairs = 100;
  const step = completeMeasures.length > 20
    ? Math.max(1, Math.floor((completeMeasures.length * (completeMeasures.length - 1) / 2) / maxPairs))
    : 1;

  let pairIdx = 0;
  for (let i = 0; i < completeMeasures.length; i++) {
    for (let j = i + 1; j < completeMeasures.length; j++) {
      pairIdx++;
      if (pairIdx % step !== 0) continue;

      const r = pearsonR(completeMeasures[i], completeMeasures[j]);
      if (!isNaN(r)) {
        totalR += r;
        pairCount++;
      }
    }
  }

  const grooveConsistency = pairCount > 0
    ? Math.round((totalR / pairCount) * 100) / 100
    : null;

  return { grooveConsistency, measuresUsed: completeMeasures.length };
}

/** Pearson correlation coefficient between two equal-length arrays */
function pearsonR(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return NaN;

  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let num = 0;
  let denomA = 0;
  let denomB = 0;

  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  const denom = Math.sqrt(denomA * denomB);
  return denom > 0 ? num / denom : NaN;
}

// ─── Main Entry Point ───

/**
 * Compute all groove metrics for a session.
 */
export function computeGrooveMetrics(
  scoredOnsets: ScoredOnset[],
  bpm: number,
  subdivision: number,
  beatsPerMeasure: number,
): GrooveMetrics {
  const { swingRatio, swingSigma, hasSwing } = computeSwingRatio(
    scoredOnsets, bpm, subdivision,
  );
  const pushPullProfile = computePushPullProfile(scoredOnsets);
  const { grooveConsistency, measuresUsed } = computeGrooveConsistency(
    scoredOnsets, beatsPerMeasure,
  );

  return {
    swingRatio,
    swingSigma,
    hasSwing,
    pushPullProfile,
    grooveConsistency,
    measuresUsed,
  };
}
