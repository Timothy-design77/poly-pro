import { expect, it } from 'vitest';
import { crossCorrelate, computeCalibrationResult } from './calibration';

it('matches a template at the final possible lag', () => {
  expect(crossCorrelate(new Float32Array([0, 0, 1, -1]), new Float32Array([1, -1]), 0, 4)).toEqual({ lag: 2, correlation: expect.closeTo(1, 6) });
});

it('matches when the recording is exactly one template long', () => {
  expect(crossCorrelate(new Float32Array([1, -1]), new Float32Array([1, -1]), 0, 2)).toEqual({ lag: 0, correlation: expect.closeTo(1, 6) });
});

it('returns a finite no-match result for an empty recording or search window', () => {
  expect(crossCorrelate(new Float32Array(), new Float32Array([1]), 0, 1)).toEqual({ lag: 0, correlation: 0 });
  expect(crossCorrelate(new Float32Array([1]), new Float32Array([1]), 1, 1)).toEqual({ lag: 0, correlation: 0 });
});

it('does not accept non-finite correlation measurements as calibration evidence', () => {
  expect(computeCalibrationResult([20, 20, 20, 20], [Infinity, Infinity, Infinity, Infinity])).toMatchObject({ quality: 'failed', accepted: 0 });
});
