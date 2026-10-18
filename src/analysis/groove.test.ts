import { describe, expect, it } from 'vitest';
import { computeSessionAnalysis } from './scoring';
import { computeGrooveConsistency } from './groove';
import { gridFromParams } from './grid';
import { DEFAULT_ANALYSIS_CONFIG, type ScoredOnset } from './types';

function pattern(measures: number): ScoredOnset[] {
  const grid = gridFromParams(120, 4, 1, measures * 2);
  const offsets = [0.012, -0.008, 0.004, -0.012];
  return computeSessionAnalysis(grid.map((beat) => ({
    time: beat.time + offsets[beat.beatIndex], peak: 0.5, flux: 1, isFlam: false,
  })), grid, { ...DEFAULT_ANALYSIS_CONFIG, latencyOffsetMs: 0 }, 120, 1, measures * 2000).scoredOnsets;
}

describe('groove across real measures', () => {
  it('recognizes a repeated timing pattern across sixteen complete measures', () => {
    const onsets = pattern(16);
    expect(onsets[4]).toMatchObject({ matchedBeatIndex: 0, matchedMeasure: 1 });
    expect(computeGrooveConsistency(onsets, 4)).toEqual({ grooveConsistency: 1, measuresUsed: 16 });
  });
  it('supports old events and excludes incomplete measures', () => {
    const legacy = pattern(17).map(({ matchedMeasure: _, ...onset }) => onset).filter((_, index) => index !== 5);
    expect(computeGrooveConsistency(legacy, 4)).toEqual({ grooveConsistency: 1, measuresUsed: 16 });
    expect(computeGrooveConsistency(pattern(15), 4)).toEqual({ grooveConsistency: null, measuresUsed: 15 });
  });
  it('does not label opposing timing patterns as a consistent groove', () => {
    const onsets = pattern(16).map((onset) => ({ ...onset, delta: onset.delta * ((onset.matchedMeasure ?? 0) < 8 ? 1 : -1) }));
    const result = computeGrooveConsistency(onsets, 4);
    expect(result.measuresUsed).toBe(16);
    expect(result.grooveConsistency).toBeLessThan(0.2);
    expect(result.grooveConsistency).toBeGreaterThan(-0.3);
  });
  it('keeps long-practice timing and measure positions correct', () => {
    const onsets = pattern(4000);
    expect(computeGrooveConsistency(onsets, 4)).toEqual({ grooveConsistency: 1, measuresUsed: 4000 });
    expect(onsets[onsets.length - 1].measurePosition).toBeCloseTo((1.5 - 0.012) / 2, 6);
    expect(onsets[onsets.length - 1].matchedMeasure).toBe(3999);
  });
});
