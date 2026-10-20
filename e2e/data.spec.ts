import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { seedSession } from './helpers';

async function openData(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Data', exact: true }).click();
}
async function readTake(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return await new Promise<any>((resolve) => { const req = db.transaction('sessions').objectStore('sessions').get('practice-take'); req.onsuccess = () => { db.close(); resolve(req.result); }; });
  });
}

test('full backup restores audio, settings, and corrected take data after deletion', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: '← Back' }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '+ New Project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Backup practice plan');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Quick Start Practice without a project/ }).click();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await page.getByRole('button', { name: /Tempo .* BPM\. Open tempo keypad/i }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Backspace', exact: true }).click();
  for (const digit of ['1', '3', '5']) await page.getByRole('dialog').getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: 'Set', exact: true }).click();
  await openData(page);
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full Backup', exact: true }).click();
  const download = await downloadEvent;
  const path = await download.path();
  expect(path).toBeTruthy();
  await expect(page.getByText('Full backup created.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete All Data', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Everything', exact: true }).click();
  await expect(page.getByText('All Poly Pro local data was deleted.')).toBeVisible();
  expect(await readTake(page)).toBeUndefined();
  await page.locator('input[accept=".polypro"]').setInputFiles({ name: 'restore.polypro', mimeType: 'application/zip', buffer: await import('node:fs/promises').then((fs) => fs.readFile(path!)) });
  await expect(page.getByText('Import preview', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText(/Imported 1 projects and 1 sessions/)).toBeVisible();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page.getByRole('button', { name: /Tempo 135 BPM/ })).toBeVisible();
  const restored = await readTake(page);
  expect(restored).toMatchObject({ totalScored: 20, hasRecording: true, score: 100 });
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
});

test('malformed backup is rejected without changing existing takes', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: '← Back' }).click();
  await openData(page);
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({ version: 3, format: 'polypro-backup', counts: { recordings: 0 } }));
  zip.file('sessions.json', JSON.stringify([{ id: 'broken', bpm: 'bad' }]));
  await page.locator('input[accept=".polypro"]').setInputFiles({ name: 'bad.polypro', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByRole('alert')).toContainText('Invalid backup');
  expect((await readTake(page)).score).toBe(100);
});

test('projects create, edit, switch and delete without losing takes', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '+ New Project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Rudiments');
  await page.getByRole('spinbutton', { name: 'Passing takes' }).fill('2');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit Rudiments', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Passing takes' })).toHaveValue('2');
  await page.getByRole('spinbutton', { name: 'Goal BPM' }).fill('130');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('button', { name: /Quick Start Practice without a project/ }).click();
  await page.getByRole('button', { name: 'Edit Rudiments', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete Rudiments?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Rudiments' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Rudiments' })).toHaveCount(0);
});
