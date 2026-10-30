import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
import { readFile } from 'node:fs/promises';

test('backup reminders snooze from the current count and clear immediately after a backup', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Practice', exact: true }).waitFor();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result); });
    const tx = database.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(20, 'sessionsSinceBackup');
    tx.objectStore('settings').put(10, 'backupThreshold');
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    database.close();
    window.dispatchEvent(new Event('polypro:backup-status-changed'));
  });
  await expect(page.getByText('You have 20 sessions since your last backup.')).toBeVisible();
  await page.getByRole('button', { name: 'Remind me later', exact: true }).click();
  // Hiding the reminder acknowledges the completed IndexedDB transaction.
  await expect(page.getByText(/sessions since your last backup/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Practice', exact: true })).toBeVisible();
  await expect(page.getByText(/sessions since your last backup/)).toHaveCount(0);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result); });
    const tx = database.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(25, 'sessionsSinceBackup');
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    database.close();
    window.dispatchEvent(new Event('polypro:backup-status-changed'));
  });
  await expect(page.getByText('You have 25 sessions since your last backup.')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup', exact: true }).click();
  const file = await download;
  const archive = await JSZip.loadAsync(await readFile((await file.path())!));
  expect(JSON.parse(await archive.file('manifest.json')!.async('string')).appVersion).toBe(version);
  await expect(page.getByText('Full backup created.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByText(/sessions since your last backup/)).toHaveCount(0);
  const threshold = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result); });
    const value = await new Promise<number>((resolve) => { const request = database.transaction('settings').objectStore('settings').get('backupThreshold'); request.onsuccess = () => resolve(request.result); });
    database.close(); return value;
  });
  expect(threshold).toBe(10);
});

test('a reminder failure does not report a successfully downloaded backup as failed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'settings' && args[1] === 'sessionsSinceBackup') {
        IDBObjectStore.prototype.put = original;
        throw new DOMException('Reminder unavailable', 'QuotaExceededError');
      }
      return original.apply(this, args);
    };
  });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup', exact: true }).click();
  await download;
  await expect(page.getByRole('status')).toContainText('Full backup created. The backup reminder could not be reset; your downloaded backup is ready.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('failed instrument deletion keeps profiles visible and can be retried', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Practice', exact: true }).waitFor();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => { const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result); });
    const tx = database.transaction('instrumentProfiles', 'readwrite');
    tx.objectStore('instrumentProfiles').put({ name: 'Kick', samples: [], accuracy: -1, lastTrained: new Date().toISOString() });
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
    database.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Instruments', exact: true }).click();
  await expect(page.getByText('Kick', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function () {
      if (this.name === 'instrumentProfiles') {
        IDBObjectStore.prototype.clear = original;
        throw new DOMException('Instrument storage unavailable. Please retry.', 'QuotaExceededError');
      }
      return original.call(this);
    };
  });
  await page.getByRole('button', { name: 'Clear all profiles', exact: true }).click();
  await page.getByRole('button', { name: 'Clear profiles', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Instrument storage unavailable. Please retry.');
  await expect(page.getByText('Kick', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear profiles', exact: true }).click();
  await expect(page.getByText('Kick', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Train instruments', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
