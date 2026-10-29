import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('tuning slider arrows do not seek the recording', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Sync click', exact: true }).click();
  await page.getByRole('slider', { name: 'Click offset' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await expect(page.getByText('Playhead 0ms', { exact: true })).toBeVisible();
});

test('silent recording is available in recording setup', async ({ page }) => {
  await page.goto('./');
  await page.getByText('Recording setup', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record without click', exact: true })).toBeVisible();
});

test('silent capture silences a running metronome, stores its grid, and restores sound', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).clickStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      if ((this.buffer?.duration ?? 10) < 5) (window as any).clickStarts++;
      return original.apply(this, args);
    };
  });
  await page.goto('./');
  await page.getByText('Recording setup', { exact: true }).click();
  await page.getByRole('button', { name: 'Record without click', exact: true }).click();
  const start = page.getByRole('button', { name: 'Start metronome', exact: true });
  await start.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).clickStarts)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  const before = await page.evaluate(() => (window as any).clickStarts);
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => (window as any).clickStarts)).toBe(before);
  await expect(page.getByRole('button', { name: 'Stop metronome', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review take', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
  const take = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    const result = await new Promise<any>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').getAll(); req.onsuccess = () => resolve(req.result[0]); });
    db.close(); return result;
  });
  expect(take.recordingTiming.scheduledBeats.length).toBeGreaterThan(1);
  expect(take.recordingTiming.recordingEndTime - take.recordingTiming.recordingStartTime).toBeCloseTo(take.durationMs / 1000, 5);
  expect(JSON.stringify(take.headlines)).not.toContain('Estimated beat grid');
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await page.getByRole('button', { name: 'Start metronome', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).clickStarts)).toBeGreaterThan(before);
  await page.getByRole('button', { name: 'Stop metronome', exact: true }).click();
  await page.reload();
  await page.getByText('Recording setup', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record without click', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('one draft previews corrections across views and protects unsaved changes', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('18 detected hits', { exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByText('92%', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText('18/20', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog', { name: 'Unsaved changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await expect(page.getByText('18 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText('20 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
});

test('playback and WAV export follow the captured grid plus the same timing preview', async ({ page }) => {
  await page.addInitScript(() => {
    const original = AudioBufferSourceNode.prototype.start;
    (window as any).starts = [];
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof original>) {
      (window as any).starts.push({ duration: this.buffer?.duration ?? 0, when: args[0] ?? 0, offline: this.context instanceof OfflineAudioContext });
      return original.apply(this, args);
    };
  });
  await seedSession(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction('recordings', 'readwrite'); const store = tx.objectStore('recordings');
    const req = store.get('hitevents:practice-take');
    req.onsuccess = () => { const events = JSON.parse(req.result); events.gridBeats.forEach((beat: any) => beat.time += 0.125); store.put(JSON.stringify(events), 'hitevents:practice-take'); };
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Sync click' }).click();
  await page.getByRole('slider', { name: 'Click offset' }).focus(); await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Toggle click overlay' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).starts.filter((s: any) => !s.offline && s.duration < 1).length)).toBeGreaterThan(0);
  const scheduled = await page.evaluate(() => (window as any).starts.filter((s: any) => !s.offline));
  expect(scheduled.find((s: any) => s.duration < 1).when - scheduled.find((s: any) => s.duration > 1).when).toBeCloseTo(0.725, 5);
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Export audio' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'With click', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/with-click\.wav$/);
  const exported = await page.evaluate(() => (window as any).starts.filter((s: any) => s.offline));
  expect(exported.find((s: any) => s.duration < 1).when).toBeCloseTo(0.725, 5);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Sync click' }).click();
  await expect(page.getByRole('slider', { name: 'Click offset' })).toHaveAttribute('aria-valuenow', '600');
});

test('failed correction save keeps the draft and saved data intact until retry', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await seedSession(page);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'recordings' && String(args[1]).startsWith('hitevents:') && !failed) { failed = true; throw new DOMException('Storage temporarily unavailable', 'QuotaExceededError'); }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return new Promise<number>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').get('practice-take'); req.onsuccess = () => { db.close(); resolve(req.result.totalScored); }; });
  })).toBe(20);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
});
