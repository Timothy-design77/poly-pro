import { expect, it } from 'vitest';
import { KNNClassifier, type InstrumentProfile } from './classification';
import type { SpectralFeatures } from './types';

const features = (centroid: number): SpectralFeatures => ({ centroid, bandwidth: 100, rolloff: centroid * 2, zeroCrossingRate: 0.1, bandEnergy: [0.2, 0.2, 0.2, 0.2, 0.2], attackTime: 2 });
const profile = (name: InstrumentProfile['name'], centroid: number): InstrumentProfile => ({ name, accuracy: -1, lastTrained: '2026-10-30', samples: Array.from({ length: 6 }, () => ({ label: name, features: features(centroid) })) });

it('keeps empty and single-instrument training unvalidated', () => {
  const classifier = new KNNClassifier();
  classifier.loadProfiles([]);
  expect(classifier.classify(features(100))).toEqual({ label: 'Unknown', confidence: 0, topCandidates: [] });
  const kick = profile('Kick', 100);
  classifier.loadProfiles([kick]);
  expect(classifier.isReady()).toBe(false);
  expect(classifier.crossValidate(kick.samples)).toBe(-1);
});

it('separates known low and high instruments with finite normalized confidence', () => {
  const classifier = new KNNClassifier();
  const kick = profile('Kick', 100), snare = profile('Snare', 3000);
  classifier.loadProfiles([kick, snare]);
  expect(classifier.isReady()).toBe(true);
  expect(classifier.classify(features(100))).toMatchObject({ label: 'Kick', confidence: 1 });
  expect(classifier.classify(features(3000))).toMatchObject({ label: 'Snare', confidence: 1 });
  expect(classifier.crossValidate(kick.samples)).toBe(1);
  expect(classifier.crossValidate(snare.samples)).toBe(1);
});
