import { expect, it } from 'vitest';
import { extractOnsetFeatures } from './features';

it.each([500, 4000])('does not count energy twice at the %i Hz separation boundary', (frequency) => {
  const sampleRate = 48000;
  const pcm = Float32Array.from({ length: 4096 }, (_, index) => Math.sin(2 * Math.PI * frequency * index / sampleRate));
  const { bandIsolated } = extractOnsetFeatures(pcm, sampleRate, 0);
  const total = bandIsolated!.low.energyRatio + bandIsolated!.mid.energyRatio + bandIsolated!.high.energyRatio;
  expect(total).toBeCloseTo(1, 6);
});

it('returns zero energy and attack time for an empty take', () => {
  const features = extractOnsetFeatures(new Float32Array(), 48000, 0);
  expect(features.bandEnergy).toEqual([0, 0, 0, 0, 0]);
  expect(features.centroid).toBe(0);
  expect(features.attackTime).toBe(0);
  expect(Object.values(features.bandIsolated!).every((band) => !band.active && band.energyRatio === 0)).toBe(true);
});
