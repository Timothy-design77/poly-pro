import { describe, it, expect } from 'vitest';
import { alignToGrid, computeSessionAnalysis } from './scoring';
import { gridFromParams } from './grid';
import { DEFAULT_ANALYSIS_CONFIG } from './types';
import type { DetectedOnset } from './types';

const onset = (time: number, peak = 0.5): DetectedOnset =>
  ({ time, peak, flux: 1, isFlam: false }) as DetectedOnset;

describe('alignToGrid', () => {
  // 120 BPM, 4/4, sub=1 → beats every 0.5s for 4s
  const grid = gridFromParams(120, 4, 1, 4);
  const windowS = 0.05; // ±50ms

  it('matches perfect onsets with zero delta', () => {
    const onsets = grid.map((b) => onset(b.time));
    const scored = alignToGrid(onsets, grid, windowS, 0);
    expect(scored.every((o) => o.scored)).toBe(true);
    for (const o of scored) expect(o.delta).toBeCloseTo(0, 6);
  });

  it('reports late hits as positive delta in ms', () => {
    const scored = alignToGrid([onset(0.520)], grid, windowS, 0);
    expect(scored[0].scored).toBe(true);
    expect(scored[0].matchedBeatTime).toBeCloseTo(0.5, 9);
    expect(scored[0].delta).toBeCloseTo(20, 5);
  });

  it('reports early hits as negative delta', () => {
    const scored = alignToGrid([onset(0.985)], grid, windowS, 0);
    expect(scored[0].delta).toBeCloseTo(-15, 5);
  });

  it('applies latency offset (subtracted from onset time)', () => {
    // Onset at 0.530 with 30ms latency correction → effective 0.500 → delta 0
    const scored = alignToGrid([onset(0.530)], grid, windowS, 0.030);
    expect(scored[0].delta).toBeCloseTo(0, 5);
  });

  it('marks onsets outside the window as unscored', () => {
    const scored = alignToGrid([onset(0.25)], grid, windowS, 0);
    expect(scored[0].scored).toBe(false);
  });

  it('each grid beat is claimed at most once (flam → second hit unscored)', () => {
    const scored = alignToGrid([onset(0.495), onset(0.515)], grid, windowS, 0);
    const matched = scored.filter((o) => o.scored);
    expect(matched).toHaveLength(1);
  });

  it('handles unsorted onset input', () => {
    const scored = alignToGrid([onset(1.0), onset(0.5), onset(1.5)], grid, windowS, 0);
    expect(scored.filter((o) => o.scored)).toHaveLength(3);
  });
});

describe('computeSessionAnalysis', () => {
  const bpm = 120;
  const grid = gridFromParams(bpm, 4, 1, 8); // 16 beats
  const config = { ...DEFAULT_ANALYSIS_CONFIG, latencyOffsetMs: 0 };

  it('perfect performance → sigma 0, hitRate 1, near-max score', () => {
    const onsets = grid.map((b) => onset(b.time));
    const a = computeSessionAnalysis(onsets, grid, config, bpm, 1, 8000);
    expect(a.sigma).toBeCloseTo(0, 6);
    expect(a.hitRate).toBeCloseTo(1, 9);
    expect(a.totalScored).toBe(16);
    // base 100 + NMA centering bonus, clamped to 100
    expect(a.score).toBe(100);
  });

  it('sigma reflects spread, not constant offset', () => {
    // Every hit exactly 20ms late: consistent → sigma ≈ 0, meanOffset ≈ 20
    const onsets = grid.map((b) => onset(b.time + 0.020));
    const a = computeSessionAnalysis(onsets, grid, config, bpm, 1, 8000);
    expect(a.sigma).toBeCloseTo(0, 4);
    expect(a.meanOffset).toBeCloseTo(20, 3);
  });

  it('alternating early/late raises sigma', () => {
    const onsets = grid.map((b, i) => onset(b.time + (i % 2 === 0 ? 0.015 : -0.015)));
    const a = computeSessionAnalysis(onsets, grid, config, bpm, 1, 8000);
    expect(a.sigma).toBeGreaterThan(14);
    expect(Math.abs(a.meanOffset)).toBeLessThan(1);
  });

  it('missed beats reduce hit rate and apply score penalty', () => {
    const onsets = grid.slice(0, 8).map((b) => onset(b.time)); // hit half
    const a = computeSessionAnalysis(onsets, grid, config, bpm, 1, 8000);
    expect(a.hitRate).toBeCloseTo(0.5, 9);
    const full = computeSessionAnalysis(
      grid.map((b) => onset(b.time)), grid, config, bpm, 1, 8000,
    );
    expect(a.score).toBeLessThan(full.score);
  });

  it('score is monotonically non-increasing as sigma grows', () => {
    const spreads = [0.002, 0.008, 0.015, 0.030, 0.045, 0.070];
    let prev = Infinity;
    for (const s of spreads) {
      const onsets = grid.map((b, i) => onset(b.time + (i % 2 === 0 ? s : -s)));
      const a = computeSessionAnalysis(onsets, grid, config, bpm, 1, 8000);
      expect(a.score).toBeLessThanOrEqual(prev);
      prev = a.score;
    }
  });

  it('score always clamps to 0–100', () => {
    const wild = grid.map((b, i) => onset(b.time + (i % 2 === 0 ? 0.2 : -0.2)));
    const a = computeSessionAnalysis(wild, grid, config, bpm, 1, 8000);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });

  it('empty onsets do not crash and yield zeroed metrics', () => {
    const a = computeSessionAnalysis([], grid, config, bpm, 1, 8000);
    expect(a.totalScored).toBe(0);
    expect(a.sigma).toBe(0);
    expect(a.hitRate).toBe(0);
  });
});
