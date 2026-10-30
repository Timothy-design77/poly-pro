import { expect, test } from '@playwright/test';

async function sessionCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open('polypro');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('sessions', 'readonly');
        const count = tx.objectStore('sessions').count();
        count.onsuccess = () => { resolve(count.result); db.close(); };
        count.onerror = () => { reject(count.error); db.close(); };
      };
    });
  });
}

test('primary navigation and BPM keypad are usable and accessible', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Practice', exact: true })).toHaveAttribute('aria-current', 'page');

  const projectsNav = page.getByRole('button', { name: 'Projects' });
  await projectsNav.click();
  await expect(projectsNav).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: /Tempo .* BPM\. Open tempo keypad/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Backspace' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('fake microphone recording reaches durable IndexedDB storage', async ({ page }) => {
  await page.goto('./');
  const start = page.getByRole('button', { name: 'Start recording' });
  await start.focus();
  await page.keyboard.press('Enter');
  const stop = page.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Recordings', exact: true })).toBeDisabled();
  await expect(page.getByText('Recording in progress')).toBeVisible();
  await page.waitForTimeout(1300);
  await stop.click();

  await expect.poll(() => sessionCount(page), { timeout: 15_000 }).toBeGreaterThan(0);

  await expect(page.getByRole('button', { name: 'Cancel Analysis' })).toHaveCount(0, { timeout: 30000 });
  const captured = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return await new Promise<any>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').getAll(); req.onsuccess = () => { resolve(req.result[0]); db.close(); }; });
  });
  expect(captured.analyzed).toBe(true);
  expect(captured.recordingTiming.recordingEndTime - captured.recordingTiming.recordingStartTime).toBeCloseTo(captured.durationMs / 1000, 5);
  expect(captured.analysisConfig.sampleRate).toBe(captured.recordingSampleRate);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
});

test('installed PWA shell reloads offline after service worker activation', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers unavailable');
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await context.setOffline(false);
});
