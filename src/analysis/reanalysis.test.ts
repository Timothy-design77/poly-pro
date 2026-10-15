import { expect, it } from 'vitest';
import { rescoreSession } from './reanalysis';
import { DEFAULT_ANALYSIS_CONFIG } from './types';

it('does not invent scored beats when a take captured only count-in', () => {
  const hits = { sessionId: 'count-in', gridBeats: [], scoredOnsets: [], rawOnsets: [{ time: 0.5, peak: 1, flux: 1, isFlam: false }] };
  const result = rescoreSession(hits, DEFAULT_ANALYSIS_CONFIG, 120, 4, 1, 1000);
  expect(result.totalExpected).toBe(0);
  expect(result.totalScored).toBe(0);
});
