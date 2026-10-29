import { describe, expect, it } from 'vitest';
import { VolumeState, type ScheduledBeat } from '../audio/types';
import { gridFromScheduledBeats } from './grid';

describe('count-in scoring isolation', () => {
  it('excludes scheduler-marked count-in beats from the recording grid', () => {
    const beats: ScheduledBeat[] = [
      { beatIndex: 0, time: 10.0, trackId: 'track-0', volumeState: VolumeState.LOUD, isCountIn: true },
      { beatIndex: 1, time: 10.5, trackId: 'track-0', volumeState: VolumeState.LOUD, isCountIn: true },
      { beatIndex: 0, time: 11.0, trackId: 'track-0', volumeState: VolumeState.ACCENT, isCountIn: false },
      { beatIndex: 1, time: 11.5, trackId: 'track-0', volumeState: VolumeState.LOUD, isCountIn: false },
    ];
    const grid = gridFromScheduledBeats(beats, 9.5, 12, 1);
    expect(grid).toHaveLength(2);
    expect(grid.map((beat) => beat.time)).toEqual([1.5, 2]);
    expect(grid[0].isDownbeat).toBe(true);
  });
});
