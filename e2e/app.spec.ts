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
  await expect(page.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

  await page.getByRole('button', { name: 'Home' }).click();
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
  await start.click();
  const stop = page.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1300);
  await stop.click();

  await expect.poll(() => sessionCount(page), { timeout: 15_000 }).toBeGreaterThan(0);

  const cancelAnalysis = page.getByRole('button', { name: 'Cancel Analysis' });
  if (await cancelAnalysis.isVisible({ timeout: 1500 }).catch(() => false)) {
    await cancelAnalysis.click();
  }
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
