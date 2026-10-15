import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { useInstrumentStore } from './instrument-store';
import { KNNClassifier } from '../analysis/classification';
import { clearAllData, getAllInstrumentProfiles } from './db';
import type { SpectralFeatures } from '../analysis/types';
vi.stubGlobal('window', globalThis);
beforeEach(async () => { await clearAllData(); useInstrumentStore.setState({ profiles: [], classifier: new KNNClassifier() }); });
const hits = (centroid: number) => Array.from({ length: 20 }, (_, index): SpectralFeatures => ({ centroid: centroid + index, bandwidth: 100, rolloff: centroid * 2, zeroCrossingRate: 0.1, bandEnergy: [0.2, 0.2, 0.2, 0.2, 0.2], attackTime: 0.001 }));

it('revalidates every instrument as labels are added and removed, and persists the result', async () => {
  const store = useInstrumentStore.getState;
  await store().addTrainingSamples('Kick', hits(100));
  expect(store().profiles[0].accuracy).toBe(-1);
  expect(store().isClassifierReady()).toBe(false);
  await store().addTrainingSamples('Snare', hits(2000));
  expect(store().isClassifierReady()).toBe(true);
  expect(store().profiles.every((profile) => profile.accuracy === 1)).toBe(true);
  expect((await getAllInstrumentProfiles()).every((profile) => profile.accuracy === 1)).toBe(true);
  await store().deleteProfile('Snare');
  expect(store().profiles[0].accuracy).toBe(-1);
  expect(store().classifyOnsets(hits(2000))[0].label).toBe('Unknown');
});
