import { describe, it, expect } from 'vitest';
import { computeTrackIOI, computeSwingOffsetS, perceptualGain } from './scheduling';

describe('computeTrackIOI', () => {
  it('main track: 60/bpm/subdivision', () => {
    expect(computeTrackIOI('track-0', 120, 1, 4, 4)).toBeCloseTo(0.5, 10);
    expect(computeTrackIOI('track-0', 120, 2, 4, 8)).toBeCloseTo(0.25, 10);
  });

  it('poly track: trackBeats evenly fill one measure', () => {
    // 120bpm 4/4 → 2s measure; 3 beats → IOI 2/3 s (3-over-4 polyrhythm)
    expect(computeTrackIOI('track-1', 120, 1, 4, 3)).toBeCloseTo(2 / 3, 10);
    // 5 beats over the same measure
    expect(computeTrackIOI('track-2', 120, 1, 4, 5)).toBeCloseTo(0.4, 10);
  });

  it('polyrhythm tracks complete exactly one measure together', () => {
    const measure = (60 / 90) * 7; // 90bpm, 7/x meter
    for (const beats of [2, 3, 4, 5, 7, 11]) {
      const ioi = computeTrackIOI('poly', 90, 3, 7, beats);
      expect(ioi * beats).toBeCloseTo(measure, 9);
    }
  });
});

describe('computeSwingOffsetS', () => {
  it('zero for straight playback', () => {
    expect(computeSwingOffsetS('track-0', 1, 0.25, 0, 2)).toBe(0);
  });

  it('only delays odd-indexed beats', () => {
    expect(computeSwingOffsetS('track-0', 0, 0.25, 1, 2)).toBe(0);
    expect(computeSwingOffsetS('track-0', 2, 0.25, 1, 2)).toBe(0);
    expect(computeSwingOffsetS('track-0', 1, 0.25, 1, 2)).toBeCloseTo(0.25 * 0.33, 10);
  });

  it('main track does not swing without subdivision', () => {
    expect(computeSwingOffsetS('track-0', 1, 0.5, 1, 1)).toBe(0);
  });

  it('poly tracks swing regardless of subdivision', () => {
    expect(computeSwingOffsetS('track-1', 1, 0.5, 0.5, 1)).toBeCloseTo(0.5 * 0.5 * 0.33, 10);
  });

  it('full swing yields ~triplet feel (33% push)', () => {
    expect(computeSwingOffsetS('track-0', 1, 0.3, 1, 4)).toBeCloseTo(0.099, 10);
  });
});

describe('perceptualGain', () => {
  it('is quadratic in volume', () => {
    expect(perceptualGain(0.5, 8)).toBeCloseTo(2.0, 10);
    expect(perceptualGain(1.0, 8)).toBeCloseTo(8.0, 10);
    expect(perceptualGain(0, 8)).toBe(0);
  });
});
