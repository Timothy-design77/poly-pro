import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('practice actions, local typography and destination labels are consistent', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const fontRequests: string[] = [];
  page.on('request', (request) => { if (request.resourceType() === 'font') fontRequests.push(request.url()); });
  await page.goto('./');
  await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 14px "DM Sans"'))).toBe(true);
  expect(fontRequests.length).toBeGreaterThan(0);
  expect(fontRequests.every((url) => url.includes('/poly-pro/fonts/'))).toBe(true);
  const nav = page.getByRole('navigation', { name: 'Primary navigation', exact: true });
  await expect(nav.getByRole('button')).toHaveText(['Practice', 'Recordings', 'Projects', 'Settings']);
  const navTop = (await nav.boundingBox())!.y;
  for (const name of ['Start metronome', 'Start recording']) {
    const bounds = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThan(navTop);
  }
  await expect(page.getByText('untracked', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record without click', exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('practice.png'), animations: 'disabled' });
  for (const name of ['Recordings', 'Projects', 'Settings']) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: testInfo.outputPath(`${name.toLowerCase()}.png`), animations: 'disabled' });
  }
  await expect(page.getByRole('button', { name: 'Cloud Enhancement', exact: true })).toHaveCount(0);
});

test('first click is prompt on cold and warm starts despite an unavailable unused sound', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    let unusedRequests = 0;
    await page.route('**/sounds/kick.wav', async (route) => { unusedRequests++; await new Promise((resolve) => setTimeout(resolve, 1600)); await route.abort(); });
    await page.addInitScript(() => {
      (window as any).clickStarts = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
        (window as any).clickStarts.push(performance.now());
        return start.apply(this, args);
      };
      document.addEventListener('pointerdown', (event) => {
        if ((event.target as HTMLElement).closest('[aria-label="Start metronome"]')) {
          (window as any).pressedAt = performance.now(); (window as any).clickStarts = [];
        }
      }, true);
    });
    await page.goto(baseURL!);
    for (const budget of [200, 100]) {
      await page.getByRole('button', { name: 'Start metronome', exact: true }).click();
      await expect.poll(() => page.evaluate(() => (window as any).clickStarts.length)).toBeGreaterThan(0);
      const delay = await page.evaluate(() => (window as any).clickStarts[0] - (window as any).pressedAt);
      expect(delay).toBeLessThan(budget);
      await page.getByRole('button', { name: 'Stop metronome', exact: true }).click();
    }
    expect(unusedRequests).toBe(0);
  } finally { await context.close(); }
});

test('a reference hit aligns playback precisely and survives undo, save and reload', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).syncSources = [];
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      (window as any).syncSources.push({ duration: this.buffer?.duration, when: args[0] ?? 0 });
      return start.apply(this, args);
    };
  });
  await seedSession(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('recordings', 'readwrite'); const store = tx.objectStore('recordings');
    const get = store.get('hitevents:practice-take');
    get.onsuccess = () => {
      const events = JSON.parse(get.result);
      const pcm = new Float32Array(480000);
      for (const hit of events.rawOnsets) {
        hit.time += 0.1375;
        const frame = Math.round(hit.time * 48000);
        for (let i = 0; i < 480; i++) pcm[frame + i] = 0.5 * Math.exp(-i / 80) * Math.cos(i * 0.5);
      }
      for (const hit of events.scoredOnsets) hit.time += 0.1375;
      store.put(JSON.stringify(events), 'hitevents:practice-take');
      store.put(new Blob([pcm.buffer]), 'practice-take');
    };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByRole('button', { name: 'Sync click', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('review.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Sync click', exact: true }).click();
  const offset = page.getByRole('slider', { name: 'Click offset', exact: true });
  await expect(offset).toHaveAttribute('aria-valuenow', '0');
  await page.getByText('Align to a recorded hit', { exact: true }).click();
  await page.getByRole('button', { name: /^Align selected hit/ }).click();
  await expect(offset).toHaveAttribute('aria-valuenow', '137.5');
  await page.getByRole('button', { name: 'Move click 1 millisecond later', exact: true }).click();
  await expect(offset).toHaveAttribute('aria-valuenow', '138.5');
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(offset).toHaveAttribute('aria-valuenow', '137.5');
  await page.screenshot({ path: testInfo.outputPath('sync.png'), animations: 'disabled' });
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).syncSources.filter((source: any) => source.duration < 1).length)).toBeGreaterThan(0);
  const starts = await page.evaluate(() => (window as any).syncSources);
  expect(starts.find((source: any) => source.duration < 1).when - starts.find((source: any) => source.duration > 1).when).toBeCloseTo(0.1375, 5);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Sync click', exact: true }).click();
  await expect(offset).toHaveAttribute('aria-valuenow', '137.5');
});

test('recordings filters show all takes and recover when the selected project is deleted', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '+ New Project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Warm-ups');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'Stop recording', exact: true }).waitFor();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review take', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  const takes = page.getByRole('button', { name: /^Review take.*BPM/ });
  const filter = page.getByRole('combobox', { name: 'Filter recordings by project' });
  await expect(takes).toHaveCount(2);
  await filter.selectOption('quick');
  await expect(takes).toHaveCount(1);
  await filter.selectOption({ label: 'Warm-ups' });
  await expect(takes).toHaveCount(1);
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Warm-ups', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Delete Warm-ups?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await expect(filter).toHaveValue('all');
  await expect(takes).toHaveCount(2);
});
