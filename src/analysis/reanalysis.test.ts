import { expect, it } from 'vitest';
import { rescoreSession } from './reanalysis';
import { DEFAULT_ANALYSIS_CONFIG } from './types';

it('does not invent scored beats when a take captured only count-in', () => {
  const hits = { sessionId: 'count-in', gridBeats: [], scoredOnsets: [], rawOnsets: [{ time: 0.5, peak: 1, flux: 1, isFlam: false }] };
  const result = rescoreSession(hits, DEFAULT_ANALYSIS_CONFIG, 120, 4, 1, 1000);
  expect(result.totalExpected).toBe(0);
  expect(result.totalScored).toBe(0);
});

it('preserves editable source hits when merging flams so narrowing can separate them again', () => {
  const rawOnsets = [{ time: 0.5, peak: 1, flux: 1, isFlam: false }, { time: 0.6, peak: 0.8, flux: 1, isFlam: false }];
  const hits = { sessionId: 'flam', scoredOnsets: [], rawOnsets };
  const merged = rescoreSession(hits, { ...DEFAULT_ANALYSIS_CONFIG, flamMergePct: 50 }, 120, 4, 1, 1000);
  expect(merged.totalDetected).toBe(1);
  expect(merged.rawOnsets).toEqual(rawOnsets);
  const separated = rescoreSession({ ...hits, rawOnsets: merged.rawOnsets }, { ...DEFAULT_ANALYSIS_CONFIG, flamMergePct: 5 }, 120, 4, 1, 1000);
  expect(separated.totalDetected).toBe(2);
});
