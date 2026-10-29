import { describe, expect, it } from 'vitest';
import { recordingPlaybackGain } from './recording-playback';

describe('recordingPlaybackGain', () => {
  it('is bounded and monotonic', () => {
    expect(recordingPlaybackGain(0)).toBe(0);
    expect(recordingPlaybackGain(0.25)).toBeGreaterThan(0);
    expect(recordingPlaybackGain(0.5)).toBeGreaterThan(recordingPlaybackGain(0.25));
    expect(recordingPlaybackGain(1)).toBe(4);
    expect(recordingPlaybackGain(10)).toBe(4);
  });
});
