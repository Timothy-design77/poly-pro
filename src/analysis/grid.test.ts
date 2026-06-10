import { describe, it, expect } from 'vitest';
import {
  gridFromParams,
  gridFromScheduledBeats,
  computeIOI,
  computeScoringWindowS,
  computeFlamMergeS,
} from './grid';
import type { ScheduledBeat } from '../audio/types';

describe('gridFromParams', () => {
  it('generates evenly spaced beats at constant bpm', () => {
    // 120 BPM, 4/4, no subdivision, 4 seconds → 8 beats at 0.5s apart
    const grid = gridFromParams(120, 4, 1, 4);
    expect(grid).toHaveLength(8);
    for (let i = 1; i < grid.length; i++) {
      expect(grid[i].time - grid[i - 1].time).toBeCloseTo(0.5, 9);
    }
  });

  it('marks downbeats and main beats correctly with subdivision', () => {
    // 60 BPM, 2/4, 2 subdivisions, 2 seconds → 4 grid points (1 measure)
    const grid = gridFromParams(60, 2, 2, 2);
    expect(grid).toHaveLength(4);
    expect(grid[0].isDownbeat).toBe(true);
    expect(grid[0].isMainBeat).toBe(true);
    expect(grid[1].isDownbeat).toBe(false);
    expect(grid[1].isMainBeat).toBe(false); // subdivision
    expect(grid[2].isMainBeat).toBe(true); // beat 2
  });

  it('increments measure numbers', () => {
    const grid = gridFromParams(120, 4, 1, 6); // 3 measures of 2s
    const measures = new Set(grid.map((b) => b.measure));
    expect(measures).toEqual(new Set([0, 1, 2]));
  });

  it('swing lengthens even IOIs and shortens odd IOIs, preserving pair duration', () => {
    const straight = gridFromParams(120, 4, 2, 4, 0);
    const swung = gridFromParams(120, 4, 2, 4, 1);
    const baseIOI = 60 / 120 / 2;

    // First IOI (after even beat 0) is longer; second (after odd beat 1) shorter
    expect(swung[1].time - swung[0].time).toBeCloseTo(baseIOI * 1.33, 9);
    expect(swung[2].time - swung[1].time).toBeCloseTo(baseIOI * 0.67, 9);
    // Pair sums match straight timing → main beats stay anchored
    expect(swung[2].time).toBeCloseTo(straight[2].time, 9);
  });

  it('never generates beats past durationSeconds', () => {
    const grid = gridFromParams(137, 7, 3, 9.3);
    for (const b of grid) expect(b.time).toBeLessThan(9.3);
  });
});

describe('gridFromScheduledBeats', () => {
  const mk = (time: number, beatIndex: number, trackId = 'track-0'): ScheduledBeat =>
    ({ time, beatIndex, trackId, volumeState: 2 }) as ScheduledBeat;

  it('filters to recording window and track-0, rebasing times', () => {
    const beats = [
      mk(0.5, 0), // before window
      mk(1.0, 1),
      mk(1.5, 2),
      mk(1.5, 0, 'track-1'), // other track
      mk(3.5, 3), // after window
    ];
    const grid = gridFromScheduledBeats(beats, 1.0, 2.0, 1);
    expect(grid).toHaveLength(2);
    expect(grid[0].time).toBeCloseTo(0, 9);
    expect(grid[1].time).toBeCloseTo(0.5, 9);
    expect(grid.every((b) => b.trackId === 'track-0')).toBe(true);
  });

  it('infers measure boundaries when beat index wraps', () => {
    const beats = [mk(0, 0), mk(0.5, 1), mk(1.0, 0), mk(1.5, 1), mk(2.0, 0)];
    const grid = gridFromScheduledBeats(beats, 0, 3, 1);
    expect(grid.map((b) => b.measure)).toEqual([0, 0, 1, 1, 2]);
  });

  it('flags main beats per subdivision', () => {
    const beats = [mk(0, 0), mk(0.25, 1), mk(0.5, 2), mk(0.75, 3)];
    const grid = gridFromScheduledBeats(beats, 0, 1, 2);
    expect(grid.map((b) => b.isMainBeat)).toEqual([true, false, true, false]);
  });
});

describe('tempo-scaled windows', () => {
  it('computeIOI matches definition', () => {
    expect(computeIOI(120, 2)).toBeCloseTo(0.25, 10);
  });

  it('scoring window is a percentage of IOI', () => {
    // 120bpm sub=1 → IOI 0.5s; 10% → 0.05s
    expect(computeScoringWindowS(120, 1, 10)).toBeCloseTo(0.05, 10);
  });

  it('flam merge window scales with subdivision IOI', () => {
    expect(computeFlamMergeS(120, 2, 45)).toBeCloseTo(0.25 * 0.45, 10);
  });
});
