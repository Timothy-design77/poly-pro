/**
 * Reanalysis — runs partial or full re-analysis on existing session data.
 *
 * Speed tiers from the plan:
 * - Scoring window only → Stage 7 only → <100ms
 * - Flam merge → Stages 5-7 → <500ms
 * - Noise gate/filtering → Stages 3-7 → 1-3s
 * - Full re-detection → Stages 1-7 → 3-10s
 */

import { computeSessionAnalysis } from './scoring';
import { gridFromParams } from './grid';
import { analyzeFlams } from './onset-detection';
import type { SessionAnalysis, AnalysisConfig } from './types';
import type { HitEventsRecord } from '../store/db';

/**
 * Quick re-score: only re-runs Stage 7 (grid alignment + scoring).
 * Uses existing onsets, just changes scoring parameters.
 * Instant (<100ms).
 */
export function rescoreSession(
  hitEvents: HitEventsRecord,
  config: AnalysisConfig,
  bpm: number,
  meterNumerator: number,
  subdivision: number,
  durationMs: number,
): SessionAnalysis {
  // Reconstruct DetectedOnsets from raw onsets
  const rawOnsets = hitEvents.rawOnsets.map((o) => ({
    time: o.time,
    peak: o.peak,
    flux: o.flux,
    isFlam: o.isFlam,
  }));

  // Re-run flam analysis with new window
  const flamMergeS = (60 / bpm / subdivision) * (config.flamMergePct / 100);
  const mergedOnsets = analyzeFlams(rawOnsets, flamMergeS);

  // Build grid
  const durationS = durationMs / 1000;
  const grid = gridFromParams(bpm, meterNumerator, subdivision, durationS);

  // Re-score
  return computeSessionAnalysis(
    mergedOnsets,
    grid,
    config,
    bpm,
    subdivision,
    durationMs,
  );
}
