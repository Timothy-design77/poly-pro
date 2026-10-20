import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('saved corrections refresh every tab and survive reopening', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText('92%', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText('18/20', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByText('18 detected hits', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByRole('tabpanel').getByText('92%', { exact: true })).toBeVisible();
});


test('tuning applies durably to the saved take', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Sync click', exact: true }).click();
  await page.getByRole('slider', { name: 'Click offset' }).focus();
  await page.keyboard.press('End');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return await new Promise<any>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').get('practice-take'); req.onsuccess = () => { resolve(req.result); db.close(); }; });
  });
  expect(saved.analysisRevision).toBe(1);
  expect(saved.analysisConfig.sampleRate).toBe(48000);
  expect(saved.analysisConfig.latencyOffsetMs).toBe(600);
  expect(saved.score).toBeLessThan(100);
  await page.getByRole('button', { name: 'Tune scoring' }).click();
  await page.getByRole('button', { name: 'Re-detect from audio' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Replace saved corrections' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep saved analysis' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('analyzes saved audio after an interrupted analysis', async ({ page }) => {
  await seedSession(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
    const store = tx.objectStore('sessions');
    const req = store.get('practice-take');
    req.onsuccess = () => store.put({ ...req.result, analyzed: false });
    tx.objectStore('recordings').delete('hitevents:practice-take');
    await new Promise<void>((resolve) => { tx.oncomplete = () => { db.close(); resolve(); }; });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Analyze saved recording' }).click();
  await expect(page.getByText('Fewer than 8 matched hits.', { exact: false })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('tabpanel').getByText('Insufficient hits', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByText(/detected hits/)).toBeVisible();
});


test('playback changes the real audio rate, loops natively, and exports WAV', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).audioStarts = [];
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      if ((this.buffer?.duration ?? 0) > 1) (window as any).audioStarts.push({ rate: this.playbackRate.value, loop: this.loop, offset: args[1] ?? 0 });
      return original.apply(this, args);
    };
  });
  await seedSession(page);
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback' })).toBeVisible();
  await page.getByRole('button', { name: 'Playback speed 1×', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioStarts.at(-1)?.rate)).toBe(1.5);
  await page.getByRole('button', { name: 'Loop region controls', exact: true }).click();
  await page.getByRole('button', { name: 'Enable or disable loop', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioStarts.at(-1)?.loop)).toBe(true);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).audioStarts.at(-1)?.offset)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pause playback' }).click();
  await page.getByRole('button', { name: 'Export audio' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Raw recording', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/raw\.wav$/);
});


test('take comparison uses a common scoring window without changing saved scores', async ({ page }) => {
  await seedSession(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
    const request = tx.objectStore('sessions').get('practice-take');
    request.onsuccess = () => tx.objectStore('sessions').put({ ...request.result, id: 'second-take', date: '2026-10-12T12:00:00Z', score: 77 });
    const events = tx.objectStore('recordings').get('hitevents:practice-take');
    events.onsuccess = () => tx.objectStore('recordings').put(JSON.stringify({ ...JSON.parse(events.result), sessionId: 'second-take' }), 'hitevents:second-take');
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Compare takes' });
  await expect(comparison.getByRole('row', { name: 'Score 100% 100% 0.0 pts' })).toBeVisible();
  await comparison.getByLabel('Comparison take', { exact: true }).selectOption('second-take');
  await expect(comparison.getByText('Choose two different takes.')).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return new Promise<number>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').get('second-take'); req.onsuccess = () => { db.close(); resolve(req.result.score); }; });
  })).toBe(77);
});
