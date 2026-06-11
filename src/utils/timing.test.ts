import { describe, it, expect } from 'vitest';
import {
  getBeatGrouping,
  getAvailableGroupings,
  getSubdivisionCount,
  getMeasureDuration,
  getIOI,
  getDefaultAccents,
  getGroupBoundaries,
  clampBpm,
} from './timing';

describe('getBeatGrouping', () => {
  it('returns single group for simple meters', () => {
    expect(getBeatGrouping(4, 4)).toEqual([4]);
    expect(getBeatGrouping(3, 4)).toEqual([3]);
    expect(getBeatGrouping(2, 2)).toEqual([2]);
  });

  it('returns 3-groups for compound meters', () => {
    expect(getBeatGrouping(6, 8)).toEqual([3, 3]);
    expect(getBeatGrouping(9, 8)).toEqual([3, 3, 3]);
    expect(getBeatGrouping(12, 8)).toEqual([3, 3, 3, 3]);
  });

  it('returns canonical groupings for irregular meters', () => {
    expect(getBeatGrouping(5, 8)).toEqual([3, 2]);
    expect(getBeatGrouping(7, 8)).toEqual([2, 2, 3]);
    expect(getBeatGrouping(11, 8)).toEqual([3, 3, 3, 2]);
  });

  it('groupings always sum to the numerator', () => {
    for (let n = 2; n <= 17; n++) {
      for (const d of [2, 4, 8, 16]) {
        const g = getBeatGrouping(n, d);
        expect(g.reduce((s, x) => s + x, 0)).toBe(n);
      }
    }
  });
});

describe('getAvailableGroupings', () => {
  it('every option sums to the numerator', () => {
    for (const [n, d] of [[5, 8], [7, 8], [9, 8], [10, 8], [7, 4]] as const) {
      for (const g of getAvailableGroupings(n, d)) {
        expect(g.reduce((s, x) => s + x, 0)).toBe(n);
      }
    }
  });

  it('default grouping is first', () => {
    expect(getAvailableGroupings(7, 8)[0]).toEqual(getBeatGrouping(7, 8));
  });

  it('simple meters have exactly one option', () => {
    expect(getAvailableGroupings(4, 4)).toHaveLength(1);
    expect(getAvailableGroupings(3, 4)).toHaveLength(1);
  });

  it('contains no duplicate groupings', () => {
    const opts = getAvailableGroupings(10, 8).map((g) => JSON.stringify(g));
    expect(new Set(opts).size).toBe(opts.length);
  });
});

describe('durations and IOI', () => {
  it('getMeasureDuration: 120bpm 4/4 = 2s', () => {
    expect(getMeasureDuration(120, 4, 4)).toBeCloseTo(2.0, 10);
  });

  it('getIOI scales inversely with bpm and subdivision', () => {
    expect(getIOI(60, 1)).toBeCloseTo(1.0, 10);
    expect(getIOI(120, 1)).toBeCloseTo(0.5, 10);
    expect(getIOI(120, 4)).toBeCloseTo(0.125, 10);
  });

  it('getSubdivisionCount multiplies', () => {
    expect(getSubdivisionCount(7, 3)).toBe(21);
  });
});

describe('getDefaultAccents', () => {
  it('marks group-boundary downbeats as ACCENT (5)', () => {
    const accents = getDefaultAccents(7, 1, [2, 2, 3]);
    expect(accents).toHaveLength(7);
    expect(accents[0]).toBe(5);
    expect(accents[2]).toBe(5);
    expect(accents[4]).toBe(5);
    expect(accents[1]).toBe(2);
  });

  it('respects subdivision spacing', () => {
    const accents = getDefaultAccents(4, 2, [2, 2]);
    expect(accents).toHaveLength(8);
    expect(accents[0]).toBe(5); // downbeat
    expect(accents[4]).toBe(5); // group 2 start × subdivision
    expect(accents[1]).toBe(2); // off-subdivision
  });
});

describe('getGroupBoundaries', () => {
  it('returns cumulative start indices', () => {
    expect(getGroupBoundaries([2, 2, 3])).toEqual([0, 2, 4]);
    expect(getGroupBoundaries([4])).toEqual([0]);
  });
});

describe('clampBpm', () => {
  it('clamps to range', () => {
    expect(clampBpm(5)).toBe(10);
    expect(clampBpm(999)).toBe(400);
  });

  it('rounds to 0.5 step', () => {
    expect(clampBpm(120.3)).toBe(120.5);
    expect(clampBpm(120.2)).toBe(120);
  });

  it('passes valid values through', () => {
    expect(clampBpm(120)).toBe(120);
    expect(clampBpm(87.5)).toBe(87.5);
  });
});
