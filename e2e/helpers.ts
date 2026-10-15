import type { Page } from '@playwright/test';

export async function seedSession(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor();
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('polypro');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const gridBeats = Array.from({ length: 20 }, (_, i) => ({ time: i / 2, beatIndex: i % 4, measure: Math.floor(i / 4), isMainBeat: true, isDownbeat: i % 4 === 0, trackId: 'track-0' }));
    const rawOnsets = gridBeats.map((beat) => ({ time: beat.time, peak: 0.5, flux: 1, isFlam: false }));
    const scoredOnsets = gridBeats.map((beat) => ({ time: beat.time, peak: 0.5, delta: 0, absDelta: 0, matchedBeatTime: beat.time, matchedBeatIndex: beat.beatIndex, measurePosition: beat.beatIndex / 4, scored: true }));
    const session = { id: 'practice-take', date: new Date().toISOString(), projectId: null, bpm: 120, meter: '4/4', subdivision: 1, durationMs: 10000, totalHits: 20, totalScored: 20, totalExpected: 20, avgDelta: 0, stdDev: 0, perfectPct: 100, score: 100, sigma: 0, hasRecording: true, analyzed: true, recordingSampleRate: 48000 };
    const pcm = new Float32Array(480000);
    for (let i = 0; i < pcm.length; i++) pcm[i] = 0.05 * Math.sin(i / 48000 * 440 * Math.PI * 2);
    const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.objectStore('recordings').put(new Blob([pcm.buffer]), session.id);
    tx.objectStore('recordings').put(JSON.stringify({ sessionId: session.id, rawOnsets, scoredOnsets, gridBeats }), `hitevents:${session.id}`);
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
}

